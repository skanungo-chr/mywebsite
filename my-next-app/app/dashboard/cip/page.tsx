"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CIPRecord } from "@/lib/cip";
import { getCIPRecords } from "@/lib/firestore";
import FilterDropdown from "@/components/FilterDropdown";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import CIPDetailModal from "@/components/CIPDetailModal";
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
  const [filterStatus, setFilterStatus]       = useState<string[]>([]);
  const [filterType, setFilterType]           = useState("");
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

  useEffect(() => { fetchCIPRecords(); }, []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterType, filterEmergency, dateRange]);

  const authHeaders = (): Record<string, string> =>
    msAccessToken ? { Authorization: `Bearer ${msAccessToken}` } : {};

  const fetchCIPRecords = async () => {
    setCipLoading(true);
    setCipError("");
    try {
      const records = await getCIPRecords();
      setCipRecords(records);
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Failed to load CIP records");
    } finally {
      setCipLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setCipError("");
    try {
      const res  = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } });
      const data = await res.json();
      if (!data.success && !data.synced) throw new Error(data.error);
      setLastSynced(new Date().toLocaleTimeString());
      await fetchCIPRecords();
    } catch (err) {
      setCipError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
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
    const matchType      = filterType      ? r.cipType.toLowerCase()   === filterType.toLowerCase()   : true;
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
        {(filterStatus.length > 0 || filterType || filterEmergency || dateRange.from || dateRange.to) && (
          <button
            onClick={() => { setFilterStatus([]); setFilterType(""); setFilterEmergency(false); setDateRange({ from: "", to: "" }); }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {lastSynced && <span className="text-xs text-gray-500">Last synced: {lastSynced}</span>}
          {isAdmin && (
            <button onClick={() => setCreateOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New CIP
            </button>
          )}
          {isAdmin && (
            <button onClick={handleSync} disabled={syncing}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {syncing ? "Syncing..." : "Sync from SharePoint"}
            </button>
          )}
          <button onClick={fetchCIPRecords} disabled={cipLoading}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm px-4 py-2 rounded-lg transition-colors">
            {cipLoading ? "Loading..." : "Refresh"}
          </button>
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
