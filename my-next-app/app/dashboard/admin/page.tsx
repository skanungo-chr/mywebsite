"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { listUsers, setUserRole, UserRecord, Role } from "@/lib/roles";

export default function AdminPage() {
  const { role } = useAuth();
  const router   = useRouter();

  const [users, setUsers]     = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null); // uid being saved

  useEffect(() => {
    if (role === null) return;          // still loading
    if (role !== "admin") { router.replace("/dashboard/cip"); return; }
    loadUsers();
  }, [role]);

  const loadUsers = async () => {
    setLoading(true);
    setUsers(await listUsers());
    setLoading(false);
  };

  const handleRoleChange = async (uid: string, newRole: Role) => {
    setSaving(uid);
    await setUserRole(uid, newRole);
    setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, role: newRole } : u));
    setSaving(null);
  };

  if (role !== "admin") return null;

  return (
    <div className="max-w-3xl">
      <p className="text-gray-400 text-sm mb-6">
        Manage user roles. Admins have full access; viewers can only read data.
      </p>

      {loading ? (
        <p className="text-gray-500 py-10 text-center">Loading users...</p>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Current Role</th>
                <th className="px-4 py-3 font-medium">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{u.displayName || "—"}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                      u.role === "admin"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-gray-700 text-gray-400"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={saving === u.uid}
                      onChange={(e) => handleRoleChange(u.uid, e.target.value as Role)}
                      className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
