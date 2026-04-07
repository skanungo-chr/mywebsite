"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getNotes } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";

interface Result {
  id: string;
  label: string;
  sub: string;
  href: string;
  type: "cip" | "note";
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-indigo-500/30 text-white rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function GlobalSearch() {
  const { user, msAccessToken } = useAuth();
  const router = useRouter();

  const [query, setQuery]           = useState("");
  const [open, setOpen]             = useState(false);
  const [results, setResults]       = useState<Result[]>([]);
  const [activeIdx, setActiveIdx]   = useState(0);
  const [cipCache, setCipCache]     = useState<CIPRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pre-load CIP records into cache once
  useEffect(() => {
    if (!cipCache.length) {
      const headers: Record<string, string> = msAccessToken
        ? { Authorization: `Bearer ${msAccessToken}` } : {};
      fetch("/api/cip", { headers })
        .then((r) => r.json())
        .then((d) => { if (d.success) setCipCache(d.records); })
        .catch(() => {});
    }
  }, [msAccessToken]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) { setResults([]); return; }
      const lower = q.toLowerCase();

      const cipResults: Result[] = cipCache
        .filter(
          (r) =>
            r.chrTicketNumbers.toLowerCase().includes(lower) ||
            r.cipType.toLowerCase().includes(lower) ||
            r.cipStatus.toLowerCase().includes(lower) ||
            r.submissionDate.includes(lower)
        )
        .slice(0, 5)
        .map((r) => ({
          id:    `cip-${r.id}`,
          label: r.chrTicketNumbers || r.id,
          sub:   `${r.cipType} · ${r.cipStatus}`,
          href:  "/dashboard/cip",
          type:  "cip" as const,
        }));

      let noteResults: Result[] = [];
      if (user) {
        try {
          const notes = await getNotes(user.uid);
          noteResults = notes
            .filter(
              (n) =>
                n.title.toLowerCase().includes(lower) ||
                n.content?.toLowerCase().includes(lower) ||
                n.tags?.some((t) => t.toLowerCase().includes(lower))
            )
            .slice(0, 5)
            .map((n) => ({
              id:    `note-${n.id}`,
              label: n.title,
              sub:   n.tags?.length ? n.tags.join(", ") : n.content?.slice(0, 60) || "Note",
              href:  "/dashboard/notes",
              type:  "note" as const,
            }));
        } catch { /* silent */ }
      }

      setResults([...cipResults, ...noteResults]);
      setActiveIdx(0);
    },
    [cipCache, user]
  );

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (href: string) => {
    router.push(href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); navigate(results[activeIdx].href); }
    if (e.key === "Escape")    { setOpen(false); inputRef.current?.blur(); }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      {/* Input */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Search CIP records & notes…"
          className="w-full bg-gray-800 border border-gray-700 text-sm text-white rounded-lg pl-9 pr-16 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 transition-colors"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 text-[10px] text-gray-600 font-mono bg-gray-700/60 border border-gray-600 rounded px-1.5 py-0.5 pointer-events-none">
          ⌘K
        </kbd>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No results for &quot;{query}&quot;</p>
          ) : (
            <ul>
              {/* Group headers */}
              {(["cip", "note"] as const).map((type) => {
                const group = results.filter((r) => r.type === type);
                if (!group.length) return null;
                return (
                  <li key={type}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                      {type === "cip" ? "CIP Records" : "Notes"}
                    </p>
                    {group.map((r) => {
                      const idx = results.indexOf(r);
                      return (
                        <button
                          key={r.id}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => navigate(r.href)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            idx === activeIdx ? "bg-indigo-600/20" : "hover:bg-gray-800"
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                            type === "cip" ? "bg-indigo-900/50 text-indigo-400" : "bg-purple-900/50 text-purple-400"
                          }`}>
                            {type === "cip" ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{highlight(r.label, query)}</p>
                            <p className="text-xs text-gray-500 truncate">{r.sub}</p>
                          </div>
                        </button>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-gray-800 px-3 py-2 flex gap-3 text-[10px] text-gray-600">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
