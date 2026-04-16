"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { fetchCIPRecordsOnce } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TFSWorkItem {
  id:           number;
  title:        string;
  status:       string;
  type:         string;
  assignedTo:   string;
  foundInBuild: string;
  fixedInBuild: string;
  createdDate:  string | null;
  changedDate:  string | null;
  areaPath:     string;
  iteration:    string;
  tags:         string;
  tfsUrl:       string;
}

// ─── TFS Config (NEXT_PUBLIC_ vars — embedded in browser bundle at build time) ─

const TFS_URL        = (process.env.NEXT_PUBLIC_TFS_URL        ?? "https://ado.chrsolutions.com/tfs").replace(/\/+$/, "").trim();
const TFS_COLLECTION = (process.env.NEXT_PUBLIC_TFS_COLLECTION ?? "CHR").trim();
const TFS_PROJECT    = (process.env.NEXT_PUBLIC_TFS_PROJECT    ?? "Omnia360Suite").trim();
const TFS_API_VER    = (process.env.NEXT_PUBLIC_TFS_API_VERSION ?? "6.0").trim();
const TFS_ENV_PAT    =  process.env.NEXT_PUBLIC_TFS_PAT        ?? "";

const PAT_OVERRIDE_KEY = "tfs_pat_override";

const TFS_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.AssignedTo",
  "System.CreatedDate",
  "System.ChangedDate",
  "Microsoft.VSTS.Build.FoundIn",
  "Microsoft.VSTS.Build.IntegrationBuild",
  "System.Tags",
  "System.AreaPath",
  "System.IterationPath",
].join(",");

function getActivePAT(): string {
  if (typeof window === "undefined") return TFS_ENV_PAT;
  const override = localStorage.getItem(PAT_OVERRIDE_KEY);
  return (override ?? TFS_ENV_PAT).trim();
}

function buildAuthHeader(pat: string): string {
  return `Basic ${btoa(`:${pat}`)}`;
}

// ─── Date range ───────────────────────────────────────────────────────────────

const DATE_RANGE_OPTIONS = [
  { label: "1 month",   months: 1  },
  { label: "3 months",  months: 3  },
  { label: "6 months",  months: 6  },
  { label: "12 months", months: 12 },
  { label: "24 months", months: 24 },
  { label: "All time",  months: 0  },
] as const;

type DateRangeMonths = typeof DATE_RANGE_OPTIONS[number]["months"];

// ─── Extract TFS IDs from CIP records ────────────────────────────────────────

function extractCIPTFSIds(cips: CIPRecord[]): number[] {
  const ids = new Set<number>();
  for (const cip of cips) {
    const raw = String(cip.chrTicketNumbers ?? "");
    const matches = raw.match(/\d{4,6}/g);
    if (matches) for (const m of matches) ids.add(parseInt(m, 10));
  }
  return [...ids];
}

// ─── Browser-side TFS fetch — GET only ───────────────────────────────────────

async function fetchTFSItemsByIds(ids: number[]): Promise<TFSWorkItem[]> {
  if (ids.length === 0) return [];

  const pat = getActivePAT();
  if (!pat) throw Object.assign(new Error("NO_PAT"), { code: "NO_PAT" });

  const auth = buildAuthHeader(pat);
  const all: TFSWorkItem[] = [];

  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    // GET — all params in query string, no body
    const url =
      `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/wit/workitems` +
      `?ids=${batch.join(",")}` +
      `&fields=${TFS_FIELDS}` +
      `&api-version=${TFS_API_VER}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth, Accept: "application/json" },
    });

    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error("INVALID_PAT"), { code: "INVALID_PAT" });
    }
    if (res.status === 405) {
      throw Object.assign(new Error("TFS_METHOD_NOT_ALLOWED"), { code: "METHOD_NOT_ALLOWED" });
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`TFS work items error ${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json() as { value?: unknown[] };
    for (const raw of (data.value ?? []) as Record<string, unknown>[]) {
      const f = (raw.fields ?? {}) as Record<string, unknown>;
      const id = Number(raw.id);
      const assigned = f["System.AssignedTo"];
      const assignedTo = assigned
        ? typeof assigned === "object"
          ? String((assigned as Record<string, unknown>).displayName ?? "Unassigned")
          : String(assigned).replace(/<[^>]+>/, "").trim() || "Unassigned"
        : "Unassigned";

      all.push({
        id,
        title:        String(f["System.Title"]                          ?? ""),
        status:       String(f["System.State"]                          ?? ""),
        type:         String(f["System.WorkItemType"]                   ?? ""),
        assignedTo,
        foundInBuild: String(f["Microsoft.VSTS.Build.FoundIn"]          ?? ""),
        fixedInBuild: String(f["Microsoft.VSTS.Build.IntegrationBuild"] ?? ""),
        createdDate:  f["System.CreatedDate"] ? String(f["System.CreatedDate"]) : null,
        changedDate:  f["System.ChangedDate"] ? String(f["System.ChangedDate"]) : null,
        areaPath:     String(f["System.AreaPath"]      ?? ""),
        iteration:    String(f["System.IterationPath"] ?? ""),
        tags:         String(f["System.Tags"]          ?? ""),
        tfsUrl:       `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_workitems/edit/${id}`,
      });
    }

    // Small delay between batches to avoid flooding the server
    if (i + 200 < ids.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "Just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}yr ago`;
}

function statusBadgeClass(s: string) {
  const l = s.toLowerCase();
  if (l === "active")                     return "bg-yellow-900/40 text-yellow-300 border-yellow-700/50";
  if (l === "closed" || l === "resolved") return "bg-green-900/40 text-green-300 border-green-700/50";
  if (l === "new")                        return "bg-gray-700/60 text-gray-300 border-gray-600/50";
  if (l === "in progress")                return "bg-cyan-900/40 text-cyan-300 border-cyan-700/50";
  if (l === "code complete")              return "bg-blue-900/40 text-blue-300 border-blue-700/50";
  return "bg-gray-800/60 text-gray-400 border-gray-600/50";
}

function shortenArea(area: string) {
  const p = area.split("\\");
  return p.length > 2 ? `…\\${p.slice(-2).join("\\")}` : area;
}

function buildCipMap(cips: CIPRecord[]): Record<number, CIPRecord[]> {
  const map: Record<number, CIPRecord[]> = {};
  for (const cip of cips) {
    const raw = String(cip.chrTicketNumbers ?? "");
    const matches = raw.match(/\d{4,6}/g);
    if (matches) for (const m of matches) {
      const id = parseInt(m, 10);
      if (!map[id]) map[id] = [];
      map[id].push(cip);
    }
  }
  return map;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800/60 animate-pulse">
      {[14, 20, 48, 20, 28, 16, 32, 8, 16].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 bg-gray-700 rounded" style={{ width: `${w * 4}px` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── PAT Override Panel ───────────────────────────────────────────────────────

function PATOverridePanel({ onSaved }: { onSaved: () => void }) {
  const [pat, setPat]       = useState("");
  const [show, setShow]     = useState(false);
  const [saved, setSaved]   = useState(false);
  const hasSaved = typeof window !== "undefined" && !!localStorage.getItem(PAT_OVERRIDE_KEY);

  const handleSave = () => {
    if (!pat.trim()) return;
    localStorage.setItem(PAT_OVERRIDE_KEY, pat.trim());
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved(); }, 800);
  };

  const handleClear = () => {
    localStorage.removeItem(PAT_OVERRIDE_KEY);
    setPat("");
    onSaved();
  };

  return (
    <details className="mt-3">
      <summary className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer select-none">
        Override PAT (optional — use your own token)
      </summary>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder={hasSaved ? "Override PAT saved — enter new to replace" : "Paste your personal PAT…"}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-indigo-500 font-mono placeholder:text-gray-600"
          />
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {show
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
              }
            </svg>
          </button>
        </div>
        <button onClick={handleSave} disabled={!pat.trim()}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors">
          {saved ? "Saved!" : "Save"}
        </button>
        {hasSaved && (
          <button onClick={handleClear}
            className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 px-3 py-2 rounded-lg transition-colors">
            Clear
          </button>
        )}
      </div>
    </details>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TFSRecordsPage() {
  const [cipRecords, setCipRecords]       = useState<CIPRecord[]>([]);
  const [tfsItems, setTfsItems]           = useState<TFSWorkItem[]>([]);
  const [cipLoading, setCipLoading]       = useState(true);
  const [tfsLoading, setTfsLoading]       = useState(false);
  const [tfsError, setTfsError]           = useState<string | null>(null);
  const [errorCode, setErrorCode]         = useState<"NO_PAT"|"INVALID_PAT"|"NETWORK"|"CORS"|"METHOD_NOT_ALLOWED"|"OTHER"|null>(null);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);

  // Date range
  const [dateRange, setDateRange] = useState<DateRangeMonths>(3);

  // Filters
  const [search, setSearch]                 = useState("");
  const [selectedType, setSelectedType]     = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedBuild, setSelectedBuild]   = useState("All");
  const [cipLinkedOnly, setCipLinkedOnly]   = useState(false);

  // Detail panel
  const [panelItem, setPanelItem] = useState<TFSWorkItem | null>(null);

  // ── CIP TFS IDs ref (persists across renders for Refresh) ────────────────
  const cipTFSIdsRef = useRef<number[]>([]);

  // ── Browser-side TFS fetch — GET only ────────────────────────────────────
  const fetchTFS = useCallback(async (ids: number[]) => {
    setTfsLoading(true);
    setTfsError(null);
    setErrorCode(null);

    try {
      const items = await fetchTFSItemsByIds(ids);
      setTfsItems(items);
      setLastUpdated(new Date());
    } catch (e) {
      const err = e as Error & { code?: string };
      const msg = err.message ?? "Unknown error";
      const code = err.code;

      if (code === "NO_PAT") {
        setErrorCode("NO_PAT");
        setTfsError("NO_PAT");
      } else if (code === "INVALID_PAT" || msg.includes("INVALID_PAT")) {
        setErrorCode("INVALID_PAT");
        setTfsError("INVALID_PAT");
      } else if (code === "METHOD_NOT_ALLOWED" || msg.includes("TFS_METHOD_NOT_ALLOWED")) {
        setErrorCode("METHOD_NOT_ALLOWED");
        setTfsError("METHOD_NOT_ALLOWED");
      } else if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError")    ||
        msg.includes("Load failed")     ||
        msg.includes("fetch failed")    ||
        msg.includes("CORS")
      ) {
        // Probe with no-cors to distinguish "server reachable but CORS blocked" vs "server unreachable"
        const probeUrl = `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/`;
        let isCors = false;
        try {
          await fetch(probeUrl, { mode: "no-cors" });
          isCors = true; // probe succeeded → server IS reachable → CORS is the issue
        } catch {
          isCors = false; // probe failed → truly unreachable
        }
        setErrorCode(isCors ? "CORS" : "NETWORK");
        setTfsError(isCors ? "CORS" : "NETWORK");
      } else {
        setErrorCode("OTHER");
        setTfsError(msg);
      }
    } finally {
      setTfsLoading(false);
    }
  }, []);

  // ── Load CIP records, then fetch TFS by extracted IDs ────────────────────
  useEffect(() => {
    fetchCIPRecordsOnce().then((r) => {
      setCipRecords(r);
      setCipLoading(false);
      const ids = extractCIPTFSIds(r);
      cipTFSIdsRef.current = ids;
      fetchTFS(ids);
    });
  }, [fetchTFS]);

  // ── CIP cross-reference map ───────────────────────────────────────────────
  const cipMap = useMemo(() => buildCipMap(cipRecords), [cipRecords]);

  const handleDateRangeChange = (months: DateRangeMonths) => {
    setDateRange(months); // client-side filter only — no re-fetch
  };

  const handleRefresh = async () => {
    await fetchTFS(cipTFSIdsRef.current);
    if (!tfsError) {
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 2000);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const allBuilds = useMemo(() => {
    const set = new Set<string>();
    for (const item of tfsItems) if (item.fixedInBuild) set.add(item.fixedInBuild);
    return ["All", ...[...set].sort()];
  }, [tfsItems]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const cutoff = dateRange > 0
      ? new Date(Date.now() - dateRange * 30.44 * 24 * 3600 * 1000)
      : null;
    return tfsItems
      .filter((item) => {
        if (cutoff && item.changedDate && new Date(item.changedDate) < cutoff) return false;
        if (q && !String(item.id).includes(q) && !item.title.toLowerCase().includes(q) &&
            !item.areaPath.toLowerCase().includes(q) && !item.tags.toLowerCase().includes(q)) return false;
        if (selectedType   !== "All" && item.type   !== selectedType)   return false;
        if (selectedStatus !== "All" && item.status !== selectedStatus) return false;
        if (selectedBuild  !== "All" && item.fixedInBuild !== selectedBuild) return false;
        if (cipLinkedOnly && !cipMap[item.id]?.length) return false;
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [tfsItems, dateRange, search, selectedType, selectedStatus, selectedBuild, cipLinkedOnly, cipMap]);

  const kpi = useMemo(() => ({
    total:   tfsItems.length,
    closed:  tfsItems.filter((i) => ["closed","resolved"].includes(i.status.toLowerCase())).length,
    active:  tfsItems.filter((i) => ["active","in progress"].includes(i.status.toLowerCase())).length,
    bugs:    tfsItems.filter((i) => i.type.toLowerCase() === "bug").length,
    stories: tfsItems.filter((i) => i.type.toLowerCase() === "user story").length,
  }), [tfsItems]);

  const hasFilters = search || selectedType !== "All" || selectedStatus !== "All" || selectedBuild !== "All" || cipLinkedOnly;
  const loading = cipLoading || tfsLoading;
  const hasPAT = !!TFS_ENV_PAT;

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["TFS ID","Type","Title","Status","Assigned To","Fixed In Build","CIP Count","Last Updated"],
      ...filtered.map((i) => [
        i.id, i.type, i.title, i.status, i.assignedTo, i.fixedInBuild,
        cipMap[i.id]?.length ?? 0,
        i.changedDate ? new Date(i.changedDate).toISOString().slice(0, 10) : "",
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `TFS_Records_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">TFS Records</h2>
          <p className="text-sm text-gray-500 mt-0.5">Azure DevOps — Omnia360Suite Project</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date range selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Filter:</span>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button key={opt.months}
                  onClick={() => !loading && handleDateRangeChange(opt.months)}
                  disabled={loading}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-700 last:border-r-0 disabled:cursor-not-allowed ${
                    dateRange === opt.months
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {lastUpdated && (
            <span className={`text-xs transition-colors ${justRefreshed ? "text-green-400 font-medium" : "text-gray-500"}`}>
              {justRefreshed ? "Updated!" : `Synced at ${formatTime(lastUpdated)}`}
            </span>
          )}
          <button onClick={handleRefresh} disabled={loading}
            className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={handleExportCSV} disabled={loading || filtered.length === 0}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors">
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 animate-pulse">
              <div className="h-3 w-24 bg-gray-700 rounded mb-3" /><div className="h-8 w-16 bg-gray-700 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Items</p>
              <p className="text-2xl font-bold text-indigo-400 tabular-nums">{kpi.total}</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Closed / Resolved</p>
              <p className="text-2xl font-bold text-green-400 tabular-nums">{kpi.closed}</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Active</p>
              <p className="text-2xl font-bold text-yellow-400 tabular-nums">{kpi.active}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Bugs / User Stories</p>
              <p className="text-2xl font-bold tabular-nums">
                <span className="text-red-400">{kpi.bugs}</span>
                <span className="text-base text-gray-500 font-normal mx-1">/</span>
                <span className="text-blue-400">{kpi.stories}</span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error banners */}
      {errorCode === "CORS" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-orange-900/20 border border-orange-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🚫</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-orange-300">CORS Blocked — TFS Server Reached but Request Denied</p>
              <p className="text-xs text-orange-400/90 mt-1">
                Your browser can reach the TFS server (VPN is working), but the server is not sending
                CORS headers that allow requests from this web app&apos;s origin.
              </p>
              <p className="text-xs text-gray-500 mt-2 font-medium">To fix this, a TFS/IIS admin must add this response header to the TFS site:</p>
              <pre className="text-xs bg-gray-900 text-green-400 rounded px-3 py-2 mt-1 overflow-x-auto">
{`Access-Control-Allow-Origin: https://my-next-app-seven-neon.vercel.app
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Accept`}
              </pre>
              <p className="text-xs text-gray-500 mt-2">
                In IIS Manager → TFS site → HTTP Response Headers, add the above. Or ask your Azure DevOps Server admin.
              </p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-orange-300 hover:text-orange-200 underline underline-offset-2 disabled:opacity-50">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {errorCode === "NETWORK" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-yellow-900/20 border border-yellow-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🌐</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-300">VPN Required — Cannot Reach TFS</p>
              <p className="text-xs text-yellow-500/90 mt-1">
                Your browser cannot reach the TFS server. Please make sure you are connected to the
                company VPN and try again.
              </p>
              <p className="text-xs text-gray-600 mt-1 font-mono">
                {TFS_URL}/{TFS_COLLECTION}/{TFS_PROJECT}/_apis/wit/wiql
              </p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-yellow-300 hover:text-yellow-200 underline underline-offset-2 disabled:opacity-50">
                Retry after connecting to VPN
              </button>
            </div>
          </div>
        </div>
      )}

      {errorCode === "NO_PAT" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🔐</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">TFS Token Not Configured</p>
              <p className="text-xs text-red-400 mt-1">
                No PAT found. Add <code className="bg-red-900/30 px-1 rounded">NEXT_PUBLIC_TFS_PAT</code> to
                Vercel environment variables and redeploy, or use the override below.
              </p>
              <PATOverridePanel onSaved={() => fetchTFS(cipTFSIdsRef.current)} />
            </div>
          </div>
        </div>
      )}

      {errorCode === "INVALID_PAT" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">❌</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">TFS Authentication Failed</p>
              <p className="text-xs text-red-400 mt-1">
                The PAT is invalid or expired. Update <code className="bg-red-900/30 px-1 rounded">NEXT_PUBLIC_TFS_PAT</code> in
                Vercel environment variables, or enter a new PAT below.
              </p>
              {!hasPAT && <p className="text-xs text-gray-500 mt-1">PAT source: environment variable not set — using override.</p>}
              <PATOverridePanel onSaved={() => fetchTFS(cipTFSIdsRef.current)} />
            </div>
          </div>
        </div>
      )}

      {errorCode === "METHOD_NOT_ALLOWED" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">⛔</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">Request Method Not Allowed (405)</p>
              <p className="text-xs text-red-400 mt-1">
                The TFS server rejected the request method. Only GET requests are supported.
              </p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-gray-300 hover:text-white underline underline-offset-2 disabled:opacity-50">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {errorCode === "OTHER" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">TFS Error</p>
              <p className="text-xs text-red-400 mt-1 font-mono break-all">{tfsError}</p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-gray-300 hover:text-white underline underline-offset-2 disabled:opacity-50">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {!tfsError && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input type="text" placeholder="Search TFS #, title, area…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
          </div>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            <option value="All">All Types</option>
            <option value="Bug">Bug</option>
            <option value="User Story">User Story</option>
            <option value="Task">Task</option>
            <option value="Test Case">Test Case</option>
          </select>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
            <option value="Resolved">Resolved</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="Code Complete">Code Complete</option>
            <option value="Design">Design</option>
          </select>
          <select value={selectedBuild} onChange={(e) => setSelectedBuild(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            {allBuilds.map((b) => <option key={b} value={b} className="bg-gray-900">{b === "All" ? "All Builds" : b}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setCipLinkedOnly((v) => !v)}>
            <div className={`w-10 h-5 rounded-full relative transition-colors ${cipLinkedOnly ? "bg-indigo-600" : "bg-gray-700"}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${cipLinkedOnly ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-gray-400">CIP Linked Only</span>
          </label>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setSelectedType("All"); setSelectedStatus("All"); setSelectedBuild("All"); setCipLinkedOnly(false); }}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-2 rounded-lg transition-colors">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
          <p className="text-sm font-medium text-white">
            {loading ? "Loading…" : `${filtered.length} work item${filtered.length !== 1 ? "s" : ""}${hasFilters ? " (filtered)" : ""}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">TFS ID</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Title</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                <th className="px-4 py-3 text-left font-semibold">Fixed In</th>
                <th className="px-4 py-3 text-left font-semibold">Area</th>
                <th className="px-4 py-3 text-left font-semibold">CIPs</th>
                <th className="px-4 py-3 text-left font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-500 text-sm">
                    {tfsItems.length === 0 ? "No TFS records found. Ensure CIP records have TFS ticket numbers." : "No items match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const linkedCips = cipMap[item.id] ?? [];
                  return (
                    <tr key={item.id} onClick={() => setPanelItem(item)}
                      className="border-b border-gray-800/60 hover:bg-gray-800/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3.5">
                        <a href={item.tfsUrl} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-400 hover:text-indigo-300 font-mono font-medium hover:underline">
                          #{item.id}
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                          item.type.toLowerCase() === "bug"        ? "bg-red-900/30 text-red-300 border-red-700/50"
                          : item.type.toLowerCase() === "user story" ? "bg-blue-900/30 text-blue-300 border-blue-700/50"
                          : item.type.toLowerCase() === "task"       ? "bg-purple-900/30 text-purple-300 border-purple-700/50"
                          : "bg-gray-800/60 text-gray-400 border-gray-600/50"
                        }`}>{item.type}</span>
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <span className="block truncate text-gray-200" title={item.title}>{item.title}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap">{item.assignedTo}</td>
                      <td className="px-4 py-3.5 text-gray-400 font-mono text-xs">{item.fixedInBuild || "—"}</td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs max-w-[160px]">
                        <span className="block truncate" title={item.areaPath}>{shortenArea(item.areaPath)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {linkedCips.length > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">
                            {linkedCips.length}
                          </span>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">{timeAgo(item.changedDate)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail slide-out panel */}
      {panelItem && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelItem(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-[#0f1623] border-l border-gray-800 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-[#0f1623]">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                  panelItem.type.toLowerCase() === "bug"        ? "bg-red-900/30 text-red-300 border-red-700/50"
                  : panelItem.type.toLowerCase() === "user story" ? "bg-blue-900/30 text-blue-300 border-blue-700/50"
                  : panelItem.type.toLowerCase() === "task"       ? "bg-purple-900/30 text-purple-300 border-purple-700/50"
                  : "bg-gray-800/60 text-gray-400 border-gray-600/50"
                }`}>{panelItem.type}</span>
                <span className="font-mono text-indigo-400 font-medium">#{panelItem.id}</span>
              </div>
              <button onClick={() => setPanelItem(null)} className="text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white leading-snug">{panelItem.title}</h3>
                <a href={panelItem.tfsUrl} target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-400 hover:underline mt-1 inline-block">Open in TFS ↗</a>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  ["Status",     <span key="s" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(panelItem.status)}`}>{panelItem.status}</span>],
                  ["Assigned To", panelItem.assignedTo],
                  ["Found In",   panelItem.foundInBuild || "—"],
                  ["Fixed In",   panelItem.fixedInBuild || "—"],
                  ["Created",    panelItem.createdDate ? new Date(panelItem.createdDate).toLocaleDateString() : "—"],
                  ["Updated",    panelItem.changedDate  ? new Date(panelItem.changedDate).toLocaleDateString() : "—"],
                ] as [string, React.ReactNode][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm text-gray-200">{value}</p>
                  </div>
                ))}
              </div>
              <div><p className="text-xs text-gray-500 mb-0.5">Area Path</p><p className="text-sm text-gray-300 font-mono break-all">{panelItem.areaPath}</p></div>
              <div><p className="text-xs text-gray-500 mb-0.5">Iteration</p><p className="text-sm text-gray-300 font-mono break-all">{panelItem.iteration}</p></div>
              {panelItem.tags && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {panelItem.tags.split(";").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="text-xs bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full text-gray-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {cipMap[panelItem.id]?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Linked CIP Records ({cipMap[panelItem.id].length})</p>
                  <div className="space-y-2">
                    {cipMap[panelItem.id].map((cip) => (
                      <div key={cip.id} className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-200 font-medium truncate">{cip.chrTicketNumbers}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                            (cip.cipStatus ?? "").toLowerCase() === "approved" || (cip.cipStatus ?? "").toLowerCase() === "successful"
                              ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/50"
                              : (cip.cipStatus ?? "").toLowerCase() === "denied"
                              ? "bg-red-900/40 text-red-400 border-red-700/50"
                              : "bg-gray-800 text-gray-400 border-gray-700"
                          }`}>{cip.cipStatus ?? "—"}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{cip.clientName ?? ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
