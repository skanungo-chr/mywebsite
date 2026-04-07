"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addNote, getNotes, updateNote, deleteNote, Note } from "@/lib/firestore";

export default function NotesPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [notes, setNotes]         = useState<Note[]>([]);
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [tags, setTags]           = useState("");
  const [isPinned, setIsPinned]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { if (user) fetchNotes(); }, [user]);

  const fetchNotes = async () => {
    if (!user) return;
    setNotes(await getNotes(user.uid));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle(""); setContent(""); setTags(""); setIsPinned(false);
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!user || !title.trim() || !isAdmin) return;
    setSaving(true);
    const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (editingId) {
      await updateNote(editingId, { title, content, tags: parsedTags, isPinned });
      setEditingId(null);
    } else {
      await addNote({ title, content, userId: user.uid, tags: parsedTags, isPinned });
    }
    setTitle(""); setContent(""); setTags(""); setIsPinned(false);
    await fetchNotes();
    setSaving(false);
  };

  const handleEdit = (note: Note) => {
    setEditingId(note.id!);
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags?.join(", ") ?? "");
    setIsPinned(note.isPinned ?? false);
  };

  const handleTogglePin = async (note: Note) => {
    await updateNote(note.id!, { isPinned: !note.isPinned });
    await fetchNotes();
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div>
      {/* Add / Edit form — admin only */}
      {isAdmin && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-4 text-gray-300">{editingId ? "Edit Note" : "Add a Note"}</h2>
          <input
            type="text" placeholder="Title" value={title}
            onChange={(e) => setTitle(e.target.value)} required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
          />
          <textarea
            placeholder="Content (optional)" value={content}
            onChange={(e) => setContent(e.target.value)} rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3 resize-none"
          />
          <input
            type="text" placeholder="Tags (comma separated)" value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="accent-indigo-500" />
              Pin this note
            </label>
            <div className="flex gap-2">
              {editingId && (
                <button type="button" onClick={resetForm}
                  className="bg-gray-700 hover:bg-gray-600 text-sm px-4 py-2 rounded-lg transition-colors">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors">
                {saving ? "Saving..." : editingId ? "Update" : "Add Note"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Viewer banner */}
      {!isAdmin && (
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 mb-6 text-sm text-gray-400">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          You have <strong className="text-white">viewer</strong> access — notes are read-only.
        </div>
      )}

      {/* Notes list */}
      <div className="space-y-3">
        {notes.length === 0 && (
          <p className="text-center text-gray-600 py-10">No notes yet.{isAdmin ? " Add one above!" : ""}</p>
        )}
        {notes.map((note) => (
          <div key={note.id}
            className={`bg-gray-900 border rounded-xl p-5 ${note.isPinned ? "border-indigo-700" : "border-gray-800"}`}>
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {note.isPinned && (
                    <span className="text-indigo-400 text-xs font-semibold uppercase tracking-wide">Pinned</span>
                  )}
                  <h3 className="font-semibold text-white">{note.title}</h3>
                </div>
                {note.content && <p className="text-gray-400 text-sm mt-1">{note.content}</p>}
                {note.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {note.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleTogglePin(note)}
                    className="text-gray-500 hover:text-indigo-400 text-sm transition-colors">
                    {note.isPinned ? "Unpin" : "Pin"}
                  </button>
                  <button onClick={() => handleEdit(note)}
                    className="text-blue-500 hover:text-blue-400 text-sm transition-colors">Edit</button>
                  <button onClick={() => handleDelete(note.id!)}
                    className="text-red-500 hover:text-red-400 text-sm transition-colors">Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
