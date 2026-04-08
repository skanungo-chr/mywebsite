import { db } from "@/lib/firebase";
import { fetchCIPRecordsPage, CIPRecord } from "@/lib/cip";
import {
    doc,
    getDoc,
    writeBatch,
    serverTimestamp,
} from "firebase/firestore";

export interface SyncResult {
    synced: number;
    skipped: number;
    deleted: number;
    errors: string[];
    timestamp: string;
    nextLink: string | null; // null = no more pages (done)
  done: boolean;
}

const BATCH_SIZE = 499;

/**
 * Delta-sync: compares SharePoint Modified timestamp with the value stored
 * in Firestore (sharepointModified field). Only writes records that have
 * changed or are new, dramatically reducing Firestore write operations.
 */
async function upsertChangedRecords(records: CIPRecord[]): Promise<{ errors: string[]; skipped: number }> {
    const errors: string[] = [];
    let skipped = 0;

  // Fetch existing Firestore docs in parallel to check modification timestamps
  const existingDocs = await Promise.all(
        records.map((r) => getDoc(doc(db, "cip_records", r.id)))
      );

  // Build list of records that are new or have changed
  const changedRecords: CIPRecord[] = [];
    for (let i = 0; i < records.length; i++) {
          const record = records[i];
          const existing = existingDocs[i];

      if (!existing.exists()) {
              // New record — always write
            changedRecords.push(record);
      } else {
              const storedModified = existing.data()?.sharepointModified as string | undefined;
              const incomingModified = record.sharepointModified;
              if (!storedModified || !incomingModified || storedModified !== incomingModified) {
                        // Changed or no timestamp stored — write
                changedRecords.push(record);
              } else {
                        // Unchanged — skip
                skipped++;
              }
      }
    }

  // Write only changed records in batches
  for (let i = 0; i < changedRecords.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const record of changedRecords.slice(i, i + BATCH_SIZE)) {
                batch.set(
                          doc(db, "cip_records", record.id),
                  {
                              chrTicketNumbers: record.chrTicketNumbers,
                              cipType: record.cipType,
                              cipStatus: record.cipStatus,
                              submissionDate: record.submissionDate,
                              emergencyFlag: record.emergencyFlag,
                              clientName: record.clientName,
                              product: record.product,
                              sharepointModified: record.sharepointModified ?? null,
                              lastSyncedAt: serverTimestamp(),
                  },
                  { merge: true }
                        );
        }
        try { await batch.commit(); }
        catch (err) { errors.push(`Batch upsert failed: ${err instanceof Error ? err.message : String(err)}`); }
  }

  return { errors, skipped };
}

/**
 * Sync ONE page of SharePoint records to Firestore.
 * Pass nextLink from previous call to continue; omit for first page.
 * When done === true, all pages have been synced.
 * Uses delta-sync: only writes records that have changed since last sync.
 */
export async function syncCIPRecordsToFirestore(
    listName?: string,
    userToken?: string | null,
    nextLink?: string | null,
  ): Promise<SyncResult> {
    const errors: string[] = [];

  let records: CIPRecord[] = [];
    let newNextLink: string | null = null;

  try {
        const page = await fetchCIPRecordsPage(listName, userToken ?? null, nextLink ?? null);
        records = page.records;
        newNextLink = page.nextLink;
  } catch (err) {
        return {
                synced: 0, skipped: 0, deleted: 0,
                errors: [err instanceof Error ? err.message : String(err)],
                timestamp: new Date().toISOString(),
                nextLink: null,
                done: false,
        };
  }

  const { errors: upsertErrors, skipped } = await upsertChangedRecords(records);
    errors.push(...upsertErrors);

  return {
        synced: records.length - skipped,
        skipped,
        deleted: 0,
        errors,
        timestamp: new Date().toISOString(),
        nextLink: newNextLink,
        done: !newNextLink,
  };
}
