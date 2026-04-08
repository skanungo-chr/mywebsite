import { db } from "@/lib/firebase";
import { fetchCIPRecords, CIPRecord } from "@/lib/cip";
import {
  collection,
  doc,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

export interface SyncResult {
  synced: number;
  deleted: number;
  errors: string[];
  timestamp: string;
}

export async function syncCIPRecordsToFirestore(
  listName?: string,
  userToken?: string | null
): Promise<SyncResult> {
  const errors: string[] = [];

  // Step 1: Fetch latest records from SharePoint
  let records: CIPRecord[] = [];
  try {
    records = await fetchCIPRecords(listName, userToken ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { synced: 0, deleted: 0, errors: [msg], timestamp: new Date().toISOString() };
  }

  // Step 2: Get existing Firestore records
  const colRef = collection(db, "cip_records");
  const existing = await getDocs(colRef);
  const existingIds = new Set(existing.docs.map((d) => d.id));
  const incomingIds = new Set(records.map((r) => r.id));

  // Step 3: Batch upsert incoming records (Firestore max 500 per batch)
  const BATCH_SIZE = 499;
  let synced = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = records.slice(i, i + BATCH_SIZE);

    for (const record of chunk) {
      const ref = doc(db, "cip_records", record.id);
      batch.set(
        ref,
        {
          chrTicketNumbers: record.chrTicketNumbers,
          cipType: record.cipType,
          cipStatus: record.cipStatus,
          submissionDate: record.submissionDate,
          emergencyFlag: record.emergencyFlag,
          clientName: record.clientName,
          product: record.product,
          lastSyncedAt: serverTimestamp(),
        },
        { merge: true }
      );
      synced++;
    }

    try {
      await batch.commit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Batch upsert failed: ${msg}`);
    }
  }

  // Step 4: Delete Firestore records no longer in SharePoint
  let deleted = 0;
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = toDelete.slice(i, i + BATCH_SIZE);

    for (const id of chunk) {
      batch.delete(doc(db, "cip_records", id));
      deleted++;
    }

    try {
      await batch.commit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Batch delete failed: ${msg}`);
    }
  }

  return {
    synced,
    deleted,
    errors,
    timestamp: new Date().toISOString(),
  };
}
