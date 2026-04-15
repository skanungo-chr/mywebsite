"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TFSRecordsPage() {
  const [cipRecords, setCipRecords]       = useState<CIPRecord[]>([]);
  const [tfsItems, setTfsItems]           = useState<TFSWorkItem[]>([]);
  const [cipLoading, setCipLoading]       = useState(true);
  const [tfsLoading, setTfsLoading]       = useState(false);
  const [tfsError, setTfsError]           = useState<string | null>(null);
  const [errorCode, setErrorCode]         = useState<"auth"|"config"|"network"|"other"|null>(null);
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

  // ── Load CIP records ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchCIPRecordsOnce().then((r) => { setCipRecords(r); setCipLoading(false); });
  }, []);

  // ── CIP cross-reference map ───────────────────────────────────────────────
  const cipMap = useMemo(() => buildCipMap(cipRecords), [cipRecords]);

  // ── Fetch TFS via server-side API route ───────────────────────────────────
  const fetchTFS = useCallback(async (months: DateRangeMonths) => {
    setTfsLoading(true);
    setTfsError(null);
    setErrorCode(null);

    try {
      const res = await fetch("/api/tfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        if (res.status === 504 || res.status === 502) {
          setTfsError("Gateway timeout — TFS did not respond in time. Try a shorter date range.");
          setErrorCode("network");
          return;
        }
        setTfsError(`Unexpected response (${res.status}): ${text.slice(0, 200)}`);
        setErrorCode("other");
        return;
      }

      const data = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        const msg = String(data.error ?? "Unknown error");
        if (res.status === 401 || res.status === 403) {
          setTfsError(msg); setErrorCode("auth");
        } else if (res.status === 500 && msg.includes("not configured")) {
          setTfsError(msg); setErrorCode("config");
        } else if (res.status === 503 || Boolean(data.isNetwork)) {
          setTfsError(msg); setErrorCode("network");
        } else {
          setTfsError(msg); setErrorCode("other");
        }
        return;
      }

      setTfsItems((data.items as TFSWorkItem[]) ?? []);
      setLastUpdated(new Date());
    } catch (e) {
      setTfsError(e instanceof Error ? e.message : "Failed to call /api/tfs");
      setErrorCode("other");
    } finally {
      setTfsLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchTFS(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateRangeChange = (months: DateRangeMonths) => {
    setDateRange(months);
    fetchTFS(months);
  };

  const handleRefresh = async () => {
    await fetchTFS(dateRange);
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
    return tfsItems
      .filter((item) => {
        if (q && !String(item.id).includes(q) && !item.title.toLowerCase().includes(q) &&
            !item.areaPath.toLowerCase().includes(q) && !item.tags.toLowerCase().includes(q)) return false;
        if (selectedType   !== "All" && item.type   !== selectedType)   return false;
        if (selectedStatus !== "All" && item.status !== selectedStatus) return false;
        if (selectedBuild  !== "All" && item.fixedInBuild !== selectedBuild) return false;
        if (cipLinkedOnly && !cipMap[item.id]?.length) return false;
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [tfsItems, search, selectedType, selectedStatus, selectedBuild, cipLinkedOnly, cipMap]);

  const kpi = useMemo(() => ({
    total:   tfsItems.length,
    closed:  tfsItems.filter((i) => ["closed","resolved"].includes(i.status.toLowerCase())).length,
    active:  tfsItems.filter((i) => ["active","in progress"].includes(i.status.toLowerCase())).length,
    bugs:    tfsItems.filter((i) => i.type.toLowerCase() === "bug").length,
    stories: tfsItems.filter((i) => i.type.toLowerCase() === "user story").length,
  }), [tfsItems]);

  const hasFilters = search || selectedType !== "All" || selectedStatus !== "All" || selectedBuild !== "All" || cipLinkedOnly;
  const loading = cipLoading || tfsLoading;

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
            <span className="text-xs text-gray-500 shrink-0">Show:</span>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.months}
                  onClick={() => !loading && handleDateRangeChange(opt.months)}
                  disabled={loading}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-700 last:border-r-0 disabled:cursor-not-allowed ${
                    dateRange === opt.months
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
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

      {/* Error banner */}
      {tfsError && (
        <div className={`mb-5 px-4 py-4 rounded-xl border ${
          errorCode === "network" ? "bg-amber-900/15 border-amber-700/40" : "bg-red-900/20 border-red-700/40"
        }`}>
          <div className="flex items-start gap-3">
            <svg className={`w-5 h-5 shrink-0 mt-0.5 ${errorCode === "network" ? "text-amber-400" : "text-red-400"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              {errorCode === "auth" ? (
                <>
                  <p className="text-sm font-semibold text-red-300">Authentication failed</p>
                  <p className="text-xs text-red-400 mt-1">
                    The <code className="bg-red-900/30 px-1 rounded">AZURE_DEVOPS_PAT</code> in Vercel environment variables is expired or invalid.
                    Generate a new PAT in Azure DevOps → User Settings → Security → Personal Access Tokens, then update it in Vercel.
                  </p>
                </>
              ) : errorCode === "config" ? (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS environment variables missing</p>
                  <p className="text-xs text-red-400 mt-1">
                    Add <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_PAT</code>,{" "}
                    <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_URL</code>,{" "}
                    <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_COLLECTION</code>,{" "}
                    <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_PROJECT</code> to Vercel environment variables and redeploy.
                  </p>
                </>
              ) : errorCode === "network" ? (
                <>
                  <p className="text-sm font-semibold text-amber-300">Cannot reach TFS server</p>
                  <p className="text-xs text-amber-500/90 mt-1 font-mono break-all">{tfsError}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS error</p>
                  <p className="text-xs text-red-400 mt-1 font-mono break-all">{tfsError}</p>
                </>
              )}
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
            {loading
              ? "Loading…"
              : `${filtered.length} work item${filtered.length !== 1 ? "s" : ""}${hasFilters ? " (filtered)" : ""}`}
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
                    {tfsItems.length === 0 ? "No TFS records found for this date range." : "No items match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const linkedCips = cipMap[item.id] ?? [];
                  return (
                    <tr key={item.id}
                      onClick={() => setPanelItem(item)}
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
                          item.type.toLowerCase() === "bug"
                            ? "bg-red-900/30 text-red-300 border-red-700/50"
                            : item.type.toLowerCase() === "user story"
                            ? "bg-blue-900/30 text-blue-300 border-blue-700/50"
                            : item.type.toLowerCase() === "task"
                            ? "bg-purple-900/30 text-purple-300 border-purple-700/50"
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
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
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
                  panelItem.type.toLowerCase() === "bug"
                    ? "bg-red-900/30 text-red-300 border-red-700/50"
                    : panelItem.type.toLowerCase() === "user story"
                    ? "bg-blue-900/30 text-blue-300 border-blue-700/50"
                    : panelItem.type.toLowerCase() === "task"
                    ? "bg-purple-900/30 text-purple-300 border-purple-700/50"
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
                  className="text-xs text-indigo-400 hover:underline mt-1 inline-block">
                  Open in TFS ↗
                </a>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {([
                  ["Status", <span key="s" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(panelItem.status)}`}>{panelItem.status}</span>],
                  ["Assigned To", panelItem.assignedTo],
                  ["Found In",   panelItem.foundInBuild || "—"],
                  ["Fixed In",   panelItem.fixedInBuild || "—"],
                  ["Created",    panelItem.createdDate ? new Date(panelItem.createdDate).toLocaleDateString() : "—"],
                  ["Updated",    panelItem.changedDate  ? new Date(panelItem.changedDate).toLocaleDateString()  : "—"],
                ] as [string, React.ReactNode][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm text-gray-200">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-0.5">Area Path</p>
                <p className="text-sm text-gray-300 font-mono break-all">{panelItem.areaPath}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Iteration</p>
                <p className="text-sm text-gray-300 font-mono break-all">{panelItem.iteration}</p>
              </div>
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
                          }`}>
                            {cip.cipStatus ?? "—"}
                          </span>
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
