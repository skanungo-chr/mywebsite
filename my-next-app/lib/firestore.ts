import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { CIPRecord } from "@/lib/cip";

function docToCIPRecord(d: { id: string; data: () => Record<string, unknown> }): CIPRecord {
  const data = d.data();
  return {
    id:               d.id,
    chrTicketNumbers: String(data.chrTicketNumbers ?? ""),
    cipType:          String(data.cipType          ?? ""),
    cipStatus:        String(data.cipStatus        ?? ""),
    submissionDate:   String(data.submissionDate   ?? ""),
    emergencyFlag:    Boolean(data.emergencyFlag),
    clientName:       String(data.clientName       ?? ""),
    product:          String(data.product          ?? ""),
    category:         String(data.category         ?? ""),
  };
}

export async function fetchCIPRecordsOnce(): Promise<CIPRecord[]> {
  const snapshot = await getDocs(collection(db, "cip_records"));
  return snapshot.docs.map(docToCIPRecord);
}

export function subscribeCIPRecords(
  onUpdate: (records: CIPRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "cip_records"),
    (snapshot) => onUpdate(snapshot.docs.map(docToCIPRecord)),
    (err) => onError?.(err)
  );
}

// ── Sync Metadata ────────────────────────────────────────────────────────────

export async function getLastSyncTimestamp(): Promise<string | null> {
  const snap = await getDoc(doc(db, "syncMetadata", "lastSync"));
  if (!snap.exists()) return null;
  return snap.data()?.timestamp ?? null;
}

export async function setLastSyncTimestamp(): Promise<void> {
  await setDoc(doc(db, "syncMetadata", "lastSync"), {
    timestamp: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

// ── Batch Upsert with retry + progress ───────────────────────────────────────

const BATCH_SIZE   = 20;
const BATCH_DELAY  = 500;   // ms between batches
const RETRY_DELAY  = 3000;  // ms before retry on backoff error
const MAX_RETRIES  = 3;

async function commitWithRetry(batch: ReturnType<typeof writeBatch>): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await batch.commit();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isBackoff = msg.includes("backoff") || msg.includes("resource-exhausted") || msg.includes("RESOURCE_EXHAUSTED");
      if (isBackoff && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY * attempt));
      } else {
        return false;
      }
    }
  }
  return false;
}

export interface UpsertProgress {
  synced: number;
  failed: number;
  total: number;
}

export async function upsertCIPRecords(
  records: CIPRecord[],
  onProgress?: (p: UpsertProgress) => void
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const total = records.length;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const record of chunk) {
      batch.set(
        doc(db, "cip_records", record.id),
        {
          chrTicketNumbers: record.chrTicketNumbers,
          cipType:          record.cipType,
          cipStatus:        record.cipStatus,
          submissionDate:   record.submissionDate,
          emergencyFlag:    record.emergencyFlag,
          clientName:       record.clientName,
          product:          record.product,
          category:         record.category,
          lastSyncedAt:     serverTimestamp(),
        },
        { merge: true }
      );
    }

    const ok = await commitWithRetry(batch);
    if (ok) {
      synced += chunk.length;
    } else {
      failed += chunk.length;
    }

    onProgress?.({ synced, failed, total });
    await new Promise((r) => setTimeout(r, BATCH_DELAY));
  }

  return { synced, failed };
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface Note {
  id?: string;
  title: string;
  content: string;
  userId: string;
  tags: string[];
  isPinned: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const addNote = async (note: Omit<Note, "id">) => {
  const docRef = await addDoc(collection(db, "notes"), {
    ...note,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const getNotes = async (userId: string): Promise<Note[]> => {
  const q = query(
    collection(db, "notes"),
    where("userId", "==", userId),
    orderBy("isPinned", "desc"),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Note));
};

export const updateNote = async (id: string, data: Partial<Note>) => {
  await updateDoc(doc(db, "notes", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteNote = async (id: string) => {
  await deleteDoc(doc(db, "notes", id));
};
