import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { CIPRecord } from "@/lib/cip";

function docToCIPRecord(d: { id: string; data: () => Record<string, unknown> }): CIPRecord {
    const data = d.data();
    return {
          id: d.id,
          chrTicketNumbers: String(data.chrTicketNumbers ?? ""),
          cipType: String(data.cipType ?? ""),
          cipStatus: String(data.cipStatus ?? ""),
          submissionDate: String(data.submissionDate ?? ""),
          emergencyFlag: Boolean(data.emergencyFlag),
          clientName: String(data.clientName ?? ""),
          product: String(data.product ?? ""),
    };
}

/**
 * One-time fetch of all CIP records from Firestore (no real-time listener).
 * Replaces subscribeCIPRecords (onSnapshot) to avoid continuous read quota drain.
 * Call this on page load; call again manually to refresh.
 */
export async function fetchCIPRecordsOnce(): Promise<CIPRecord[]> {
    const snapshot = await getDocs(collection(db, "cip_records"));
    return snapshot.docs.map(docToCIPRecord);
}

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

export async function upsertCIPRecords(records: CIPRecord[]): Promise<void> {
    const BATCH_SIZE = 100;
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
                                lastSyncedAt: serverTimestamp(),
                    },
                    { merge: true }
                          );
          }
          await batch.commit();
          // Throttle to avoid Firestore rate limits
      await new Promise((r) => setTimeout(r, 300));
    }
}
