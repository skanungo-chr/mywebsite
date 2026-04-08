"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CIPRecord, FETCH_FROM_YEARS } from "@/lib/cip";
import { fetchCIPRecordsOnce, upsertCIPRecords, setLastSyncTimestamp } from "@/lib/firestore";
import FilterDropdown from "@/components/FilterDropdown";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import CIPDetailModal from "@/components/CIPDetailModal";
import CIPStatusChart from "@/components/CIPStatusChart";
import { CIPsByCategory, CIPsByCompany, CIPsByProduct, CIPsByTFS, CIPsMonthlyTrend } from "@/components/charts";
import CIPCreateModal from "@/components/CIPCreateModal";
import CIPEditModal from "@/components/CIPEditModal";

const STATUS_COLORS: Record<string, string> = {
  open:          "bg-blue-900/40 text-blue-300",
  "in progress": "bg-yellow-900/40 text-yellow-300",
  completed:     "bg-green-900/40 text-green-300",
  closed:        "bg-gray-700 text-gray-400",
};

function statusClass(status: string) {
  return STATUS_COLORS[status.toLowerCase()] ?? "bg-gray-700 text-gray-400";
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function CIPPage() {
  const { msAccessToken, role } = useAuth();
  const isAdmin = role === "admin";

  const [cipRecords, setCipRecords]     = useState<CIPRecord[]>([]);
  const [cipLoading, setCipLoading]     = useState(false);
  const [cipError, setCipError]         = useState("");
  const [syncing, setSyncing]           = useState(false);
  const [seeding, setSeeding]           = useState(false);
  const [lastSynced, setLastSynced]     = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number } | null>(null);
  const [syncSummary, setSyncSummary]   = useState<{ synced: number; failed: number } | null>(null);
  const [syncFromYear, setSyncFromYear] = useState("2025");
  const [filterStatus, setFilterStatus]       = useState<string[]>([]);
  const [filterType, setFilterType]           = useState<string[]>([]);
  const [filterEmergency, setFilterEmergency] = useState(false);
  const [dateRange, setDateRange]       = useState<DateRange>({ from: "", to: "" });
  const [debugResult, setDebugResult]   = useState<string | null>(null);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [createOpen, setCreateOpen]     = useState(false);
  const [editId, setEditId]             = useState<string | null>(null);

  // Sorting
  type SortKey = "chrTicketNumbers" | "cipType" | "cipStatus" | "submissionDate" | "emergencyFlag";
  const [sortKey, setSortKey]   = useState<SortKey>("submissionDate");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);

  // One-time fetch on mount — avoids persistent WebSocket competing with sync writes
  useEffect(() => {
    setCipLoading(true);
    fetchCIPRecordsOnce().then(
      (records) => { setCipRecords(records); setCipLoading(false); setCipError(""); },
      (err)     => { setCipError(err.message); setCipLoading(false); }
    );
  }, []);

  const handleExportCSV = () => {
    const headers = ["#", "CHR Ticket #", "CIP Type", "Status", "Submission Date", "Emergency"];
    const rows = sortedCIP.map((r, i) => [
      i + 1,
      r.chrTicketNumbers,
      r.cipType,
      r.cipStatus,
      r.submissionDate ? new Date(r.submissionDate).toLocaleDateString() : "",
      r.emergencyFlag ? "Yes" : "No",
    ]);

    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `cip-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterType, filterEmergency, dateRange]);

  const authHeaders = (): Record<string, string> =>
    msAccessToken ? { Authorization: `Bearer ${msAccessToken}` } : {};

  // Subscription keeps data live; this is called after sync/edit to clear errors
  const fetchCIPRecords = () => { setCipError(""); };

  const handleSync = async () => {
    if (syncing) return; // prevent double sync
    setSyncing(true);
    setCipError("");
    setSyncSummary(null);
    setSyncProgress(null);

    let nextLink: string | null = null;
    let page = 0;
    let totalSynced = 0;
    let totalFailed = 0;
    let grandTotal = 0;

    try {
      // First pass: count total records for progress display
      do {
        page++;
        const res = await fetch("/api/sync/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ nextLink, fromYear: syncFromYear }),
        });
        const text = await res.text();
        let data: Record<string, unknown>;
        try { data = JSON.parse(text); }
        catch { throw new Error(res.status === 504 ? `Fetch timed out on page ${page}` : `Server error (${res.status})`); }
        if (!data.success) throw new Error(data.error as string);

        const records = data.records as import("@/lib/cip").CIPRecord[];
        grandTotal += records.length;
        setSyncProgress({ synced: totalSynced, total: grandTotal });

        const result = await upsertCIPRecords(records, (p) => {
          setSyncProgress({ synced: totalSynced + p.synced, total: grandTotal });
        });

        totalSynced += result.synced;
        totalFailed += result.failed;
        nextLink = (data.nextLink as string) ?? null;
        setSyncProgress({ synced: totalSynced, total: grandTotal });
      } while (nextLink);

      await setLastSyncTimestamp();
      setLastSynced(new Date().toLocaleTimeString());
      setSyncSummary({ synced: totalSynced, failed: totalFailed });
      // Refresh dashboard after sync
      const updated = await fetchCIPRecordsOnce();
      setCipRecords(updated);
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setCipError("");
    try {
      const res  = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchCIPRecords();
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const handleDebug = async () => {
    setDebugResult("Running...");
    try {
      const res  = await fetch("/api/cip/debug", { headers: authHeaders() });
      const data = await res.json();
      setDebugResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setDebugResult(err instanceof Error ? err.message : "Debug failed");
    }
  };

  const handleCheckProducts = async () => {
    setDebugResult("Checking SharePoint Product field values...");
    try {
      const res  = await fetch("/api/sync/fetch", { headers: authHeaders() });
      const data = await res.json();
      if (data.error) { setDebugResult(`Error: ${data.error}`); return; }
      const products = (data.sample as { id: string; Product: unknown }[]).map(
        (s) => `id=${s.id}  Product=${JSON.stringify(s.Product)}`
      ).join("\n");
      setDebugResult(`SharePoint raw Product values (first 10 records):\n\n${products}`);
    } catch (err) {
      setDebugResult(err instanceof Error ? err.message : "Failed");
    }
  };

  const STATUS_DOTS: Record<string, string> = {
    open:          "bg-blue-400",
    "in progress": "bg-yellow-400",
    completed:     "bg-green-400",
    closed:        "bg-gray-500",
  };

  const uniqueStatuses = [...new Set(cipRecords.map((r) => r.cipStatus).filter(Boolean))];
  const uniqueTypes    = [...new Set(cipRecords.map((r) => r.cipType).filter(Boolean))];

  const statusOptions = uniqueStatuses.map((s) => ({
    value: s,
    label: s,
    dot: STATUS_DOTS[s.toLowerCase()] ?? "bg-gray-500",
  }));

  const typeOptions = uniqueTypes.map((t) => ({ value: t, label: t }));

  const filteredCIP = cipRecords.filter((r) => {
    const matchStatus    = filterStatus.length > 0 ? filterStatus.some((s) => r.cipStatus.toLowerCase() === s.toLowerCase()) : true;
    const matchType      = filterType.length > 0 ? filterType.some((t) => r.cipType.toLowerCase() === t.toLowerCase()) : true;
    const matchEmergency = filterEmergency ? r.emergencyFlag === true                                 : true;
    const recDate        = r.submissionDate ? r.submissionDate.slice(0, 10) : "";
    const matchFrom      = dateRange.from  ? recDate >= dateRange.from : true;
    const matchTo        = dateRange.to    ? recDate <= dateRange.to   : true;
    return matchStatus && matchType && matchEmergency && matchFrom && matchTo;
  });

  const sortedCIP = [...filteredCIP].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "submissionDate") {
      return mul * (a.submissionDate < b.submissionDate ? -1 : a.submissionDate > b.submissionDate ? 1 : 0);
    }
    if (sortKey === "emergencyFlag") {
      return mul * ((a.emergencyFlag ? 1 : 0) - (b.emergencyFlag ? 1 : 0));
    }
    const av = (a[sortKey] as string).toLowerCase();
    const bv = (b[sortKey] as string).toLowerCase();
    return mul * av.localeCompare(bv);
  });

  // ── KPI computations ──────────────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const kpi = {
    total:      filteredCIP.length,
    approved:   filteredCIP.filter((r) => r.cipStatus.toLowerCase() === "approved").length,
    submitted:  filteredCIP.filter((r) => r.cipStatus.toLowerCase() === "submitted").length,
    draft:      filteredCIP.filter((r) => r.cipStatus.toLowerCase() === "draft").length,
    emergency:  filteredCIP.filter((r) => r.emergencyFlag).length,
    thisMonth:  filteredCIP.filter((r) => r.submissionDate?.slice(0, 7) === thisMonth).length,
  };

  const totalPages  = Math.max(1, Math.ceil(sortedCIP.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const pageStart   = (safePage - 1) * pageSize;
  const pageRecords = sortedCIP.slice(pageStart, pageStart + pageSize);

  // Page numbers to show (max 5 around current)
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1
  );

  return (
    <div>
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {[
          {
            label: "Total CIPs",
            value: kpi.total,
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            ),
            color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20",
            onClick: undefined,
          },
          {
            label: "Approved",
            value: kpi.approved,
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20",
            onClick: () => { setFilterStatus(["Approved"]); setPage(1); },
          },
          {
            label: "Submitted",
            value: kpi.submitted,
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20",
            onClick: () => { setFilterStatus(["Submitted"]); setPage(1); },
          },
          {
            label: "Draft",
            value: kpi.draft,
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
              </svg>
            ),
            color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20",
            onClick: () => { setFilterStatus(["Draft"]); setPage(1); },
          },
          {
            label: "Emergency",
            value: kpi.emergency,
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            ),
            color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20",
            onClick: () => { setFilterEmergency(true); setPage(1); },
          },
          {
            label: "This Month",
            value: kpi.thisMonth,
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
            ),
            color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20",
            onClick: undefined,
          },
        ].map(({ label, value, icon, color, bg, border, onClick }) => (
          <div
            key={label}
            onClick={onClick}
            className={`relative rounded-xl border p-4 flex flex-col gap-2 transition-all ${bg} ${border} ${
              onClick ? "cursor-pointer hover:brightness-125" : ""
            } ${cipLoading ? "animate-pulse" : ""}`}
          >
            <div className={`${color} opacity-80`}>{icon}</div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {cipLoading ? <span className="inline-block w-10 h-6 bg-gray-700 rounded" /> : value.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
            </div>
            {onClick && value > 0 && (
              <span className="absolute top-3 right-3 text-[10px] text-gray-600 hover:text-gray-400">filter →</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {!cipLoading && cipRecords.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <CIPStatusChart records={filteredCIP} />
            <CIPsByProduct records={filteredCIP} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <CIPsByCompany records={filteredCIP} />
            <CIPsByCategory records={filteredCIP} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <CIPsByTFS records={filteredCIP} />
            <CIPsMonthlyTrend records={filteredCIP} />
          </div>
        </>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FilterDropdown
          multi
          label="Status"
          options={statusOptions}
          value={filterStatus}
          onChange={setFilterStatus}
        />

        <FilterDropdown
          multi
          label="CIP Type"
          options={typeOptions}
          value={filterType}
          onChange={setFilterType}
        />

        <DateRangeFilter value={dateRange} onChange={setDateRange} />

        <button
          onClick={() => setFilterEmergency((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            filterEmergency
              ? "bg-red-600/20 border-red-500/50 text-red-400"
              : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${filterEmergency ? "bg-red-400" : "bg-gray-500"}`} />
          Emergency
        </button>

        {/* Live result count */}
        {cipRecords.length > 0 && (
          <span className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
            filteredCIP.length === cipRecords.length
              ? "bg-gray-800 border-gray-700 text-gray-400"
              : "bg-indigo-600/15 border-indigo-500/30 text-indigo-300"
          }`}>
            {filteredCIP.length === cipRecords.length
              ? `${cipRecords.length} record${cipRecords.length !== 1 ? "s" : ""}`
              : `${filteredCIP.length} of ${cipRecords.length}`}
          </span>
        )}

        {/* Clear all filters */}
        {(filterStatus.length > 0 || filterType.length > 0 || filterEmergency || dateRange.from || dateRange.to) && (
          <button
            onClick={() => { setFilterStatus([]); setFilterType([]); setFilterEmergency(false); setDateRange({ from: "", to: "" }); }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Sync summary */}
          {syncSummary && !syncing && (
            <span className="text-xs text-green-400">
              Sync complete: {syncSummary.synced.toLocaleString()} synced
              {syncSummary.failed > 0 && <span className="text-red-400">, {syncSummary.failed} failed</span>}
            </span>
          )}
          {lastSynced && !syncSummary && <span className="text-xs text-gray-500">Last synced: {lastSynced}</span>}
          {isAdmin && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                {/* Year selector */}
                <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <select
                    value={syncFromYear}
                    onChange={(e) => setSyncFromYear(e.target.value)}
                    disabled={syncing}
                    className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer disabled:opacity-50"
                  >
                    {Object.keys(FETCH_FROM_YEARS).map((y) => (
                      <option key={y} value={y} className="bg-gray-900">{y === "All" ? "All Records" : `From ${y}`}</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleSync} disabled={syncing}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition-colors min-w-[160px] text-center">
                  {syncing && syncProgress
                    ? `Syncing... ${syncProgress.synced.toLocaleString()} / ${syncProgress.total.toLocaleString()} (${Math.round((syncProgress.synced / Math.max(syncProgress.total, 1)) * 100)}%)`
                    : syncing ? "Syncing..."
                    : "Sync from SharePoint"}
                </button>
              </div>
              {syncing && syncProgress && (
                <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${Math.round((syncProgress.synced / Math.max(syncProgress.total, 1)) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
          <button onClick={handleExportCSV}
            className="bg-emerald-700 hover:bg-emerald-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Export CSV
          </button>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400">
            <span className={`w-1.5 h-1.5 rounded-full ${cipLoading ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
            {cipLoading ? "Loading..." : "Ready"}
          </div>
          {isAdmin && (
            <button onClick={handleSeed} disabled={seeding}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-xs px-3 py-2 rounded-lg transition-colors text-gray-400">
              {seeding ? "Seeding..." : "Seed Data"}
            </button>
          )}
          {isAdmin && (
            <button onClick={handleDebug}
              className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-lg transition-colors text-gray-400">
              Debug
            </button>
          )}
          {isAdmin && (
            <button onClick={handleCheckProducts}
              className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-lg transition-colors text-amber-400">
              Check SP Products
            </button>
          )}
        </div>
      </div>

      {debugResult && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gray-400">Debug Output</span>
            <button onClick={() => setDebugResult(null)} className="text-xs text-gray-500 hover:text-gray-300">Close</button>
          </div>
          <pre className="text-xs text-green-400 overflow-auto max-h-64 whitespace-pre-wrap">{debugResult}</pre>
        </div>
      )}

      {cipError && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
          {cipError}
        </div>
      )}

      {cipLoading ? (
        <p className="text-center text-gray-500 py-16">Loading CIP records...</p>
      ) : filteredCIP.length === 0 ? (
        <p className="text-center text-gray-600 py-16">
          {cipRecords.length === 0
            ? <>No CIP records found. Click &quot;Seed Data&quot; or &quot;Sync from SharePoint&quot; to load data.</>
            : "No records match your filters."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-left select-none">
                  <th className="px-4 py-3 font-medium w-12">#</th>
                  {(
                    [
                      { key: "chrTicketNumbers", label: "CHR Ticket #" },
                      { key: "cipType",          label: "CIP Type"     },
                      { key: "cipStatus",        label: "Status"       },
                      { key: "submissionDate",   label: "Submission Date" },
                      { key: "emergencyFlag",    label: "Emergency"    },
                    ] as { key: SortKey; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-4 py-3 font-medium cursor-pointer hover:text-white transition-colors group"
                    >
                      <span className="flex items-center gap-1.5">
                        {label}
                        <span className="flex flex-col gap-px opacity-40 group-hover:opacity-70">
                          <svg className={`w-2.5 h-2.5 transition-opacity ${sortKey === key && sortDir === "asc" ? "opacity-100 text-indigo-400" : ""}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0z"/></svg>
                          <svg className={`w-2.5 h-2.5 transition-opacity ${sortKey === key && sortDir === "desc" ? "opacity-100 text-indigo-400" : ""}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0H10z"/></svg>
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pageRecords.map((record, idx) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedId(record.id)}
                    className="hover:bg-gray-900/60 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{pageStart + idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-white">{record.chrTicketNumbers || "—"}</td>
                    <td className="px-4 py-3 text-gray-300">{record.cipType || "—"}</td>
                    <td className="px-4 py-3">
                      {record.cipStatus ? (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass(record.cipStatus)}`}>
                          {record.cipStatus}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {record.submissionDate ? new Date(record.submissionDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {record.emergencyFlag ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-900/40 text-red-400">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer: count + page-size picker */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                {sortedCIP.length} record{sortedCIP.length !== 1 ? "s" : ""}
                {sortedCIP.length !== cipRecords.length && ` (filtered from ${cipRecords.length})`}
                {msAccessToken ? " · Delegated access" : ""}
              </span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-4">
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Prev
              </button>

              {pageNumbers.map((n, i) => {
                const prev = pageNumbers[i - 1];
                return (
                  <span key={n} className="flex items-center gap-1">
                    {prev && n - prev > 1 && (
                      <span className="px-1 text-gray-600 text-sm select-none">…</span>
                    )}
                    <button
                      onClick={() => setPage(n)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        n === safePage
                          ? "bg-indigo-600 text-white"
                          : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                );
              })}

              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}

      <CIPDetailModal
        cipId={selectedId}
        onClose={() => setSelectedId(null)}
        isAdmin={isAdmin}
        onEdit={(id) => { setSelectedId(null); setEditId(id); }}
      />
      <CIPCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); handleSync(); }}
        msAccessToken={msAccessToken}
      />
      <CIPEditModal
        cipId={editId}
        onClose={() => setEditId(null)}
        onSaved={() => { setEditId(null); fetchCIPRecords(); }}
        msAccessToken={msAccessToken}
      />
    </div>
  );
}
