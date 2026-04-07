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
  onSnapshot,
  serverTimestamp,
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
  };
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
