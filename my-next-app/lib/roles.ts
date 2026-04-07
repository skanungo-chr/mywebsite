import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";

export type Role = "admin" | "viewer";

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  photoURL?: string;
}

/**
 * Read the role field directly — returns null if the doc or field is missing.
 */
async function readRole(uid: string): Promise<Role | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const role = snap.data().role;
  return role === "admin" || role === "viewer" ? role : null;
}

export async function hasAnyAdmin(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "admin")));
  return !snap.empty;
}

/**
 * Ensures every signed-in user has a role stored in Firestore.
 * - First user with no admin in the system → admin
 * - Everyone else → viewer
 * Returns the resolved role.
 */
export async function ensureUserRole(
  uid: string,
  profile: { email: string; displayName: string; photoURL: string }
): Promise<Role> {
  const existing = await readRole(uid);
  if (existing !== null) return existing;          // role already set, nothing to do

  // No role on this user — bootstrap it
  const role: Role = (await hasAnyAdmin()) ? "viewer" : "admin";
  await setDoc(
    doc(db, "users", uid),
    { ...profile, role, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return role;
}

/** Read a user's stored role (falls back to "viewer" if unset). */
export async function getUserRole(uid: string): Promise<Role> {
  return (await readRole(uid)) ?? "viewer";
}

export async function listUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({
    uid:         d.id,
    email:       d.data().email       ?? "",
    displayName: d.data().displayName ?? "",
    role:        (d.data().role as Role) ?? "viewer",
    photoURL:    d.data().photoURL    ?? "",
  }));
}

export async function setUserRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(db, "users", uid), { role });
}
