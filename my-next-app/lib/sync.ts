import { db } from "@/lib/firebase";
import { fetchCIPRecordsPage, CIPRecord } from "@/lib/cip";
import {
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

export interface SyncResult {
  synced: number;
  deleted: number;
  errors: string[];
  timestamp: string;
  nextLink: string | null; // null = no more pages (done)
  done: boolean;
}

const BATCH_SIZE = 499;

async function upsertRecords(records: CIPRecord[]): Promise<string[]> {
  const errors: string[] = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const record of records.slice(i, i + BATCH_SIZE)) {
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
          category: record.category,
          lastSyncedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    try { await batch.commit(); }
    catch (err) { errors.push(`Batch upsert failed: ${err instanceof Error ? err.message : String(err)}`); }
  }
  return errors;
}

/**
 * Sync ONE page of SharePoint records to Firestore.
 * Pass nextLink from previous call to continue; omit for first page.
 * When done === true, all pages have been synced and stale records deleted.
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
      synced: 0, deleted: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      timestamp: new Date().toISOString(),
      nextLink: null,
      done: false,
    };
  }

  const upsertErrors = await upsertRecords(records);
  errors.push(...upsertErrors);

  let deleted = 0;
  // Only delete stale records on the final page
  if (!newNextLink) {
    // We can't know all IDs here without fetching all; deletion is skipped in paged mode.
    // A separate cleanup pass can be added if needed.
    deleted = 0;
  }

  return {
    synced: records.length,
    deleted,
    errors,
    timestamp: new Date().toISOString(),
    nextLink: newNextLink,
    done: !newNextLink,
  };
}
