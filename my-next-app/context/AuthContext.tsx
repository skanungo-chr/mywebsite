"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  OAuthProvider,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ensureUserRole, getUserRole, hasAnyAdmin, Role } from "@/lib/roles";

interface AuthContextType {
  user: User | null;
  role: Role | null;
  loading: boolean;
  msAccessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginWithMicrosoft: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({
  tenant: process.env.NEXT_PUBLIC_AZURE_TENANT_ID ?? "common",
  prompt: "select_account",
});
// Only request basic profile scopes on the SSO app (Dashboard CIP App)
// SharePoint scopes belong to the Graph API app and are not requested at login
microsoftProvider.addScope("User.Read");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [role, setRole]               = useState<Role | null>(null);
  const [loading, setLoading]         = useState(true);
  const [msAccessToken, setMsAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        document.cookie = "app-auth=1; path=/; max-age=86400; SameSite=Lax";
        const r = await ensureUserRole(firebaseUser.uid, {
          email:       firebaseUser.email        ?? "",
          displayName: firebaseUser.displayName  ?? "",
          photoURL:    firebaseUser.photoURL     ?? "",
        });
        setRole(r);
      } else {
        document.cookie = "app-auth=; path=/; max-age=0";
        setRole(null);
        setMsAccessToken(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    // First user ever becomes admin; all subsequent users are viewers
    const firstAdmin = !(await hasAnyAdmin());
    const assignedRole: Role = firstAdmin ? "admin" : "viewer";
    await setDoc(doc(db, "users", uid), {
      email: credential.user.email,
      displayName: credential.user.displayName ?? "",
      photoURL: "",
      role: assignedRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setRole(assignedRole);
  };

  const loginWithMicrosoft = async () => {
    const result = await signInWithPopup(auth, microsoftProvider);
    const credential = OAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) setMsAccessToken(credential.accessToken);

    const uid = result.user.uid;
    // Upsert user doc — preserve existing role if already set
    const existingRole = await getUserRole(uid);
    const isNew = existingRole === "viewer";
    const firstAdmin = isNew && !(await hasAnyAdmin());
    const assignedRole: Role = firstAdmin ? "admin" : existingRole;

    await setDoc(
      doc(db, "users", uid),
      {
        email: result.user.email,
        displayName: result.user.displayName ?? "",
        photoURL: result.user.photoURL ?? "",
        role: assignedRole,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setRole(assignedRole);
  };

  const logout = async () => {
    await signOut(auth);
    setMsAccessToken(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, msAccessToken, login, signup, loginWithMicrosoft, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
