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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "Just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active")                     return "bg-yellow-900/40 text-yellow-300 border-yellow-700/50";
  if (s === "closed" || s === "resolved") return "bg-green-900/40 text-green-300 border-green-700/50";
  if (s === "new")                        return "bg-gray-700/60 text-gray-300 border-gray-600/50";
  if (s === "in progress")                return "bg-cyan-900/40 text-cyan-300 border-cyan-700/50";
  if (s === "code complete")              return "bg-blue-900/40 text-blue-300 border-blue-700/50";
  return "bg-gray-800/60 text-gray-400 border-gray-600/50";
}

function cipStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "approved" || s === "successful") return "bg-emerald-900/40 text-emerald-400 border-emerald-700/50";
  if (s === "denied")                         return "bg-red-900/40 text-red-400 border-red-700/50";
  return "bg-gray-800 text-gray-400 border-gray-700";
}

function shortenArea(area: string): string {
  const parts = area.split("\\");
  return parts.length > 2 ? `…\\${parts.slice(-2).join("\\")}` : area;
}

function extractTFSIds(cips: CIPRecord[]): number[] {
  const ids = new Set<number>();
  for (const cip of cips) {
    const raw = String(cip.chrTicketNumbers ?? "");
    const matches = raw.match(/\d{4,6}/g);
    if (matches) for (const m of matches) ids.add(parseInt(m, 10));
  }
  return [...ids];
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800/60 animate-pulse">
      {[14, 20, 48, 20, 28, 16, 32, 8, 16].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className={`h-3.5 bg-gray-700 rounded`} style={{ width: `${w * 4}px` }} />
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
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);

  // Filters
  const [search, setSearch]               = useState("");
  const [selectedType, setSelectedType]   = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedBuild, setSelectedBuild] = useState("All");
  const [cipLinkedOnly, setCipLinkedOnly] = useState(false);

  // Detail panel
  const [panelItem, setPanelItem]         = useState<TFSWorkItem | null>(null);

  // ── Load CIP records ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchCIPRecordsOnce().then((r) => { setCipRecords(r); setCipLoading(false); });
  }, []);

  // ── CIP → TFS cross-reference map ─────────────────────────────────────────
  const cipMap = useMemo(() => {
    const map: Record<number, CIPRecord[]> = {};
    for (const cip of cipRecords) {
      const raw = String(cip.chrTicketNumbers ?? "");
      const matches = raw.match(/\d{4,6}/g);
      if (matches) {
        for (const m of matches) {
          const id = parseInt(m, 10);
          if (!map[id]) map[id] = [];
          map[id].push(cip);
        }
      }
    }
    return map;
  }, [cipRecords]);

  // ── Fetch TFS data via API route ──────────────────────────────────────────
  const fetchTFS = useCallback(async (cips: CIPRecord[]) => {
    const ids = extractTFSIds(cips);
    if (ids.length === 0) { setTfsLoading(false); return; }

    setTfsLoading(true);
    setTfsError(null);
    setIsNetworkError(false);

    try {
      const res  = await fetch(`/api/tfs?ids=${ids.join(",")}`);
      const data = await res.json();

      if (!res.ok) {
        setTfsError(data.error ?? "Unknown error");
        setIsNetworkError(data.isNetwork ?? res.status === 503);
        return;
      }

      setTfsItems(data.items ?? []);
      setLastUpdated(new Date());
    } catch {
      setTfsError("Failed to reach the TFS API endpoint.");
    } finally {
      setTfsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cipLoading && cipRecords.length > 0) fetchTFS(cipRecords);
  }, [cipLoading, cipRecords, fetchTFS]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    await fetchTFS(cipRecords);
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 2000);
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
        if (q && !String(item.id).includes(q) &&
            !item.title.toLowerCase().includes(q) &&
            !item.areaPath.toLowerCase().includes(q) &&
            !item.tags.toLowerCase().includes(q)) return false;
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
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `TFS_Records_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = cipLoading || tfsLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">TFS Records</h2>
          <p className="text-sm text-gray-500 mt-0.5">Azure DevOps — Omnia360Suite Project</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className={`text-xs transition-colors ${justRefreshed ? "text-green-400 font-medium" : "text-gray-500"}`}>
              {justRefreshed ? "Updated!" : `Synced at ${formatTime(lastUpdated)}`}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            disabled={loading || filtered.length === 0}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 animate-pulse">
              <div className="h-3 w-24 bg-gray-700 rounded mb-3" />
              <div className="h-8 w-16 bg-gray-700 rounded" />
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
              <p className="text-2xl font-bold text-red-400 tabular-nums">
                <span>{kpi.bugs}</span>
                <span className="text-base text-gray-500 font-normal mx-1">/</span>
                <span className="text-blue-400">{kpi.stories}</span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error banner */}
      {tfsError && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1 min-w-0">
              {isNetworkError ? (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS server unreachable from Vercel</p>
                  <p className="text-xs text-red-400 mt-1">
                    The server at <code className="font-mono bg-red-900/30 px-1 rounded">devci01.dev.chrlab.int:8080</code> is on an internal network — Vercel cloud cannot reach it directly.
                  </p>
                  <div className="mt-2 text-xs text-red-500/80 space-y-0.5">
                    <p><span className="text-red-400 font-medium">(a)</span> Expose TFS via a reverse proxy or Cloudflare Tunnel</p>
                    <p><span className="text-red-400 font-medium">(b)</span> Run the Next.js app locally where TFS is on the same network</p>
                    <p><span className="text-red-400 font-medium">(c)</span> Set up a VPN-connected relay server to proxy TFS API calls</p>
                  </div>
                </>
              ) : tfsError.includes("401") || tfsError.includes("403") ? (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS authentication failed</p>
                  <p className="text-xs text-red-400 mt-1">Check <code className="font-mono bg-red-900/30 px-1 rounded">AZURE_DEVOPS_PAT</code> in Vercel environment variables. Ensure the token has <strong>Work Items — Read</strong> scope and has not expired.</p>
                </>
              ) : tfsError.includes("not configured") ? (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS environment variables missing</p>
                  <p className="text-xs text-red-400 mt-1">Add <code className="font-mono bg-red-900/30 px-1 rounded">AZURE_DEVOPS_PAT</code>, <code className="font-mono bg-red-900/30 px-1 rounded">AZURE_DEVOPS_URL</code>, <code className="font-mono bg-red-900/30 px-1 rounded">AZURE_DEVOPS_COLLECTION</code>, and <code className="font-mono bg-red-900/30 px-1 rounded">AZURE_DEVOPS_PROJECT</code> to Vercel.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS error</p>
                  <p className="text-xs text-red-400 mt-1 font-mono break-all">{tfsError}</p>
                </>
              )}
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-red-300 hover:text-red-200 underline underline-offset-2 disabled:opacity-50">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {!tfsError && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search TFS #, title, area…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
            />
          </div>

          {/* Type */}
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            <option value="All">All Types</option>
            <option value="Bug">Bug</option>
            <option value="User Story">User Story</option>
          </select>

          {/* Status */}
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
            <option value="Resolved">Resolved</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="Code Complete">Code Complete</option>
          </select>

          {/* Build */}
          <select value={selectedBuild} onChange={(e) => setSelectedBuild(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            {allBuilds.map((b) => <option key={b} value={b} className="bg-gray-900">{b === "All" ? "All Builds" : b}</option>)}
          </select>

          {/* CIP Linked toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setCipLinkedOnly((v) => !v)}>
            <div className={`w-10 h-5 rounded-full relative transition-colors ${cipLinkedOnly ? "bg-indigo-600" : "bg-gray-700"}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${cipLinkedOnly ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-gray-400">CIP Linked Only</span>
          </label>

          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setSelectedType("All"); setSelectedStatus("All"); setSelectedBuild("All"); setCipLinkedOnly(false); }}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-3 py-2 rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!tfsError && (
        <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">TFS #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Assigned To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Fixed In</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Area</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">CIPs</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-gray-600 text-sm">
                      {tfsItems.length === 0
                        ? "No TFS work items found. Verify CIP records have valid TFS IDs in chrTicketNumbers."
                        : "No items match the selected filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, i) => {
                    const cipCount = cipMap[item.id]?.length ?? 0;
                    const isBug    = item.type.toLowerCase() === "bug";
                    return (
                      <tr key={item.id}
                        className={`hover:bg-gray-800/40 transition-colors ${i % 2 === 1 ? "bg-[#1a1f2e]/20" : ""}`}>

                        {/* TFS # */}
                        <td className="px-4 py-3">
                          <a href={item.tfsUrl} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline whitespace-nowrap">
                            #{item.id}
                          </a>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isBug ? "bg-red-500" : "bg-blue-400"}`} />
                            <span className="text-xs text-gray-400">{item.type || "—"}</span>
                          </div>
                        </td>

                        {/* Title */}
                        <td className="px-4 py-3 max-w-xs">
                          <span className="text-xs text-gray-200 line-clamp-2 leading-relaxed" title={item.title}>
                            {item.title || "—"}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.status ? (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadgeClass(item.status)}`}>
                              {item.status}
                            </span>
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </td>

                        {/* Assigned To */}
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[130px] truncate" title={item.assignedTo}>
                          {item.assignedTo}
                        </td>

                        {/* Fixed In */}
                        <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                          {item.fixedInBuild || "—"}
                        </td>

                        {/* Area */}
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate" title={item.areaPath}>
                          {shortenArea(item.areaPath) || "—"}
                        </td>

                        {/* CIP Count */}
                        <td className="px-4 py-3 text-center">
                          {cipCount > 0 ? (
                            <button onClick={() => setPanelItem(item)}
                              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/60 border border-indigo-700/50 px-2 py-0.5 rounded-full transition-colors">
                              {cipCount}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-700">—</span>
                          )}
                        </td>

                        {/* Updated */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {timeAgo(item.changedDate)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Showing <span className="text-gray-300 font-medium">{filtered.length}</span> of{" "}
                <span className="text-gray-300 font-medium">{tfsItems.length}</span> items
              </span>
              {cipRecords.length > 0 && (
                <span className="text-xs text-gray-600">
                  {extractTFSIds(cipRecords).length} unique TFS IDs in {cipRecords.length} CIP records
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Detail Panel ───────────────────────────────────────────────────── */}
      {panelItem && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setPanelItem(null)}>
          {/* Backdrop */}
          <div className="flex-1 bg-black/40 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="w-full max-w-md bg-[#111827] border-l border-gray-700 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/60 shrink-0">
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-indigo-400 font-semibold">TFS #{panelItem.id}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadgeClass(panelItem.status)}`}>
                    {panelItem.status}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white leading-snug line-clamp-3">{panelItem.title}</h3>
              </div>
              <button onClick={() => setPanelItem(null)}
                className="text-gray-500 hover:text-white transition-colors shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Work item meta */}
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <p className="text-gray-500 mb-0.5">Type</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${panelItem.type.toLowerCase() === "bug" ? "bg-red-500" : "bg-blue-400"}`} />
                      <span className="text-gray-200">{panelItem.type || "—"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Assigned To</p>
                    <p className="text-gray-200 truncate">{panelItem.assignedTo}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Found In Build</p>
                    <p className="text-gray-200 font-mono">{panelItem.foundInBuild || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Fixed In Build</p>
                    <p className="text-gray-200 font-mono">{panelItem.fixedInBuild || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500 mb-0.5">Area Path</p>
                    <p className="text-gray-400 font-mono text-[10px] break-all">{panelItem.areaPath || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500 mb-0.5">Iteration</p>
                    <p className="text-gray-400 font-mono text-[10px] break-all">{panelItem.iteration || "—"}</p>
                  </div>
                  {panelItem.tags && (
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {panelItem.tags.split(";").map((t) => t.trim()).filter(Boolean).map((tag) => (
                          <span key={tag} className="text-[10px] bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-gray-500 mb-0.5">Last Updated</p>
                    <p className="text-gray-400">{panelItem.changedDate ? new Date(panelItem.changedDate).toLocaleString() : "—"}</p>
                  </div>
                </div>

                <a href={panelItem.tfsUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700/40 hover:border-indigo-600 px-3 py-2 rounded-lg transition-colors w-fit">
                  Open in TFS
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>

              {/* Linked CIP Records */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Linked CIP Records
                  <span className="ml-2 text-indigo-400 font-bold">{cipMap[panelItem.id]?.length ?? 0}</span>
                </p>

                {!cipMap[panelItem.id]?.length ? (
                  <p className="text-xs text-gray-600 italic">No CIP records reference this TFS item.</p>
                ) : (
                  <div className="space-y-2">
                    {cipMap[panelItem.id].map((cip) => (
                      <div key={cip.id} className="bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2.5 hover:border-gray-700 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-indigo-300 font-semibold truncate">
                              {cip.chrTicketNumbers || "—"}
                            </p>
                            <p className="text-xs text-gray-300 mt-0.5 truncate">{cip.clientName || "—"}</p>
                            <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-2">
                              <span>{cip.submissionDate?.slice(0, 10) ?? ""}</span>
                              {cip.emergencyFlag && <span className="text-red-400 font-semibold">EMERGENCY</span>}
                            </p>
                          </div>
                          {cip.cipStatus && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cipStatusClass(cip.cipStatus)}`}>
                              {cip.cipStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
