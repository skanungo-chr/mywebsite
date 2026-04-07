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
} from "firebase/firestore";
import { CIPRecord } from "@/lib/cip";

export const getCIPRecords = async (): Promise<CIPRecord[]> => {
  const snapshot = await getDocs(collection(db, "cip_records"));
  return snapshot.docs.map((d) => ({
    id: d.id,
    chrTicketNumbers: d.data().chrTicketNumbers ?? "",
    cipType:          d.data().cipType          ?? "",
    cipStatus:        d.data().cipStatus         ?? "",
    submissionDate:   d.data().submissionDate    ?? "",
    emergencyFlag:    d.data().emergencyFlag      ?? false,
  }));
};

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
