"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { fetchCIPRecordsOnce } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, Cell,
} from "recharts";

const STATUS_BADGE_COLORS: Record<string, string> = {
  approved:      "bg-emerald-900/40 text-emerald-400 border-emerald-700/50",
  submitted:     "bg-blue-900/40 text-blue-400 border-blue-700/50",
  draft:         "bg-yellow-900/40 text-yellow-400 border-yellow-700/50",
  denied:        "bg-red-900/40 text-red-400 border-red-700/50",
  cancelled:     "bg-gray-800/60 text-gray-400 border-gray-600/50",
  "rolled back": "bg-orange-900/40 text-orange-400 border-orange-700/50",
  failed:        "bg-red-900/60 text-red-300 border-red-600/50",
  successful:    "bg-emerald-900/60 text-emerald-300 border-emerald-600/50",
};

function statusBadgeClass(status: string) {
  return STATUS_BADGE_COLORS[status.toLowerCase()] ?? "bg-indigo-900/40 text-indigo-400 border-indigo-700/50";
}

const CIP_STATUSES = [
  "Approved", "Denied", "Draft", "Submitted",
  "Successful", "Cancelled", "Rolled Back", "Failed",
];

const PRODUCT_COLORS: Record<string, string> = {
  "OMNIA":                    "#6366F1",
  "Omnia360":                 "#8B5CF6",
  "OASIS FM":                 "#06B6D4",
  "Advanced Customer Portal": "#F59E0B",
  "Payment Processor":        "#EF4444",
  "Report Writer":            "#10B981",
  "XML Invoice":              "#EC4899",
  "Data Warehouse":           "#F97316",
  "General Software":         "#3B82F6",
  "Oasis Provisioning":       "#14B8A6",
  "Solomon":                  "#A855F7",
  "(blank)":                  "#4B5563",
};

function colorFor(name: string): string {
  return PRODUCT_COLORS[name] ?? "#4472C4";
}

const NORMALIZE: Record<string, string> = {
  "omnia":                    "OMNIA",
  "omnia360":                 "Omnia360",
  "oasis":                    "OASIS FM",
  "oasis fm":                 "OASIS FM",
  "advanced customer portal": "Advanced Customer Portal",
  "acp":                      "Advanced Customer Portal",
  "payment processor":        "Payment Processor",
  "payment":                  "Payment Processor",
  "report writer":            "Report Writer",
  "xml invoice":              "XML Invoice",
  "xml":                      "XML Invoice",
  "data warehouse":           "Data Warehouse",
  "general software":         "General Software",
};

function normalizeProduct(raw: string): string {
  if (!raw || raw.trim() === "") return "(blank)";
  const trimmed = raw.trim();
  if (PRODUCT_COLORS[trimmed]) return trimmed;
  return NORMALIZE[trimmed.toLowerCase()] ?? trimmed;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", { month: "short", year: "numeric" });
}

export default function CIPsByCategoryPage() {
  const [records, setRecords]                   = useState<CIPRecord[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedClient, setSelectedClient]     = useState("All");
  const [selectedFormStatus, setSelectedFormStatus] = useState("All");
  const [fromMonth, setFromMonth]               = useState("");
  const [toMonth, setToMonth]                   = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [tableSearch, setTableSearch]           = useState("");

  useEffect(() => {
    fetchCIPRecordsOnce().then((r) => { setRecords(r); setLoading(false); });
  }, []);

  const clientNames = useMemo(
    () => [...new Set(records.map((r) => r.clientName).filter(Boolean))].sort(),
    [records]
  );

  const formStatuses = useMemo(
    () => [...new Set(records.map((r) => r.cipType).filter(Boolean))].sort(),
    [records]
  );

  // All months present in data, sorted
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.submissionDate) set.add(r.submissionDate.slice(0, 7));
    }
    return [...set].sort();
  }, [records]);

  const filtered = useMemo(() => records.filter((r) => {
    const matchStatus = selectedStatuses.length === 0 ||
      selectedStatuses.some((s) => r.cipStatus?.toLowerCase() === s.toLowerCase());
    const matchClient = selectedClient === "All" || r.clientName === selectedClient;
    const matchType   = selectedFormStatus === "All" || r.cipType === selectedFormStatus;
    const recMonth    = r.submissionDate ? r.submissionDate.slice(0, 7) : "";
    const matchFrom   = fromMonth ? recMonth >= fromMonth : true;
    const matchTo     = toMonth   ? recMonth <= toMonth   : true;
    return matchStatus && matchClient && matchType && matchFrom && matchTo;
  }), [records, selectedStatuses, selectedClient, selectedFormStatus, fromMonth, toMonth]);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const key = normalizeProduct(r.product ?? "");
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([nameA, cntA], [nameB, cntB]) => {
        if (nameA === "(blank)") return 1;
        if (nameB === "(blank)") return -1;
        return cntB - cntA;
      })
      .map(([product, count]) => ({ product, count }));
  }, [filtered]);

  // Group filtered records by product, same sort order as chartData
  const groupedData = useMemo(() => {
    const map: Record<string, CIPRecord[]> = {};
    for (const r of filtered) {
      const key = normalizeProduct(r.product ?? "");
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return chartData.map(({ product, count }) => ({
      product,
      count,
      records: map[product] ?? [],
    }));
  }, [filtered, chartData]);

  const grandTotal    = filtered.length;
  const blankCount    = chartData.find((d) => d.product === "(blank)")?.count ?? 0;
  const blankPct      = grandTotal > 0 ? Math.round((blankCount / grandTotal) * 100) : 0;
  const mostlyBlank   = blankPct > 70 && grandTotal > 10;

  const kpi = useMemo(() => ({
    total:      filtered.length,
    approved:   filtered.filter((r) => r.cipStatus?.toLowerCase() === "approved").length,
    successful: filtered.filter((r) => r.cipStatus?.toLowerCase() === "successful").length,
    denied:     filtered.filter((r) => r.cipStatus?.toLowerCase() === "denied").length,
  }), [filtered]);

  const hasFilters = selectedStatuses.length > 0 || selectedClient !== "All" || selectedFormStatus !== "All" || !!fromMonth || !!toMonth;

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedClient("All");
    setSelectedFormStatus("All");
    setFromMonth("");
    setToMonth("");
  };

  const handleStatusToggle = (status: string) =>
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );

  const toggleProduct = (product: string) =>
    setExpandedProducts((prev) => ({ ...prev, [product]: !prev[product] }));

  const expandAll  = () => setExpandedProducts(Object.fromEntries(groupedData.map(({ product }) => [product, true])));
  const collapseAll = () => setExpandedProducts({});

  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["Product", "Count"],
      ...chartData.map((d) => [d.product, d.count]),
      ["Grand Total", grandTotal],
    ];
    const csv  = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `CIPs_by_Category_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">CIPs by Category</h2>
          <p className="text-sm text-gray-500 mt-0.5">Count of Category by Product</p>
        </div>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-3 py-1.5 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset Filters
            </button>
          )}
          <button onClick={handleExportCSV} disabled={loading || chartData.length === 0}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total CIPs",  value: kpi.total,      color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/20"  },
          { label: "Approved",    value: kpi.approved,   color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20"   },
          { label: "Successful",  value: kpi.successful, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
          { label: "Denied",      value: kpi.denied,     color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20"     },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
            {loading ? <div className="h-8 w-16 bg-gray-700 rounded animate-pulse" /> : (
              <>
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color} tabular-nums`}>{value.toLocaleString()}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Sync warning */}
      {!loading && mostlyBlank && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-300">
              {blankPct}% of records have no Product data
            </p>
            <p className="text-xs text-amber-500 mt-0.5">
              Go to <strong>CIP Records</strong> → set year to <strong>All Records</strong> → click <strong>Sync from SharePoint</strong> to populate product data for all records.
            </p>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Left: CIP Status checkboxes */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">CIP Status</span>
              <div className="flex items-center gap-2">
                {selectedStatuses.length > 0 && (
                  <>
                    <span className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                      {selectedStatuses.length}
                    </span>
                    <button onClick={() => setSelectedStatuses([])}
                      className="text-gray-500 hover:text-red-400 transition-colors" title="Clear">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {loading ? (
              <div className="space-y-2.5">
                {CIP_STATUSES.map((_, i) => (
                  <div key={i} className="h-4 bg-gray-700 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {CIP_STATUSES.map((status) => {
                  const checked = selectedStatuses.includes(status);
                  return (
                    <label key={status} className="flex items-center gap-2.5 cursor-pointer group"
                      onClick={() => handleStatusToggle(status)}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-indigo-600 border-indigo-500" : "bg-gray-800 border-gray-600 group-hover:border-gray-400"
                      }`}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm select-none transition-colors ${
                        checked ? "text-white font-medium" : "text-gray-400 group-hover:text-gray-200"
                      }`}>
                        {status}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedStatuses.length === 0 && !loading && (
              <p className="text-xs text-gray-600 mt-3 border-t border-gray-800 pt-2">All statuses shown</p>
            )}
          </div>
        </div>

        {/* Right: filters + chart + table */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Dropdown filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">Client Name</label>
              <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}
                disabled={loading}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full disabled:opacity-50 cursor-pointer">
                <option value="All">(All)</option>
                {clientNames.map((n) => <option key={n} value={n} className="bg-gray-900">{n}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">CIP Type (formStatus)</label>
              <select value={selectedFormStatus} onChange={(e) => setSelectedFormStatus(e.target.value)}
                disabled={loading}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full disabled:opacity-50 cursor-pointer">
                <option value="All">(All)</option>
                {formStatuses.map((f) => <option key={f} value={f} className="bg-gray-900">{f}</option>)}
              </select>
            </div>
          </div>

          {/* Month range filter */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">From Month</label>
              <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}
                disabled={loading}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full disabled:opacity-50 cursor-pointer">
                <option value="">(All)</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m} className="bg-gray-900">{formatMonth(m)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">To Month</label>
              <select value={toMonth} onChange={(e) => setToMonth(e.target.value)}
                disabled={loading}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full disabled:opacity-50 cursor-pointer">
                <option value="">(All)</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m} className="bg-gray-900">{formatMonth(m)}</option>
                ))}
              </select>
            </div>
            {(fromMonth || toMonth) && (
              <div className="flex flex-col gap-1 shrink-0">
                <label className="text-xs text-gray-500 font-medium invisible">Clear</label>
                <button onClick={() => { setFromMonth(""); setToMonth(""); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-500/40 px-3 py-2 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear dates
                </button>
              </div>
            )}
          </div>

          {/* Chart */}
          {loading ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="h-4 w-40 bg-gray-700 rounded animate-pulse mb-4" />
              <div className="h-72 bg-gray-800/50 rounded animate-pulse" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="h-72 flex flex-col items-center justify-center gap-3 text-gray-600">
                <span className="text-sm">No records match the selected filters</span>
                {hasFilters && (
                  <button onClick={resetFilters}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Count of Category</h3>
                <span className="text-xs font-semibold bg-indigo-900/50 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-800">
                  {grandTotal.toLocaleString()} total
                </span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 28, right: 16, left: 0, bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="product"
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={90}
                    tickLine={false}
                    axisLine={{ stroke: "#374151" }}
                  />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8, color: "#fff", fontSize: 12 }}
                    cursor={{ fill: "rgba(99,102,241,0.08)" }}
                    formatter={(v) => [`${Number(v).toLocaleString()} CIPs`, "Count"]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={72}>
                    <LabelList dataKey="count" position="top" style={{ fill: "#9CA3AF", fontSize: 11, fontWeight: 600 }} />
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={colorFor(entry.product)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pivot table — accordion */}
          {!loading && groupedData.length > 0 && (
            <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden">

              {/* Table toolbar */}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900/50">
                <div className="relative flex-1 max-w-xs">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search incidents…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={expandAll}
                    className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/60 px-3 py-1.5 rounded-lg transition-colors">
                    Expand All
                  </button>
                  <button onClick={collapseAll}
                    className="text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
                    Collapse All
                  </button>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-8" />
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Products</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Count</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {groupedData.map((row, i) => {
                    const isOpen = !!expandedProducts[row.product];
                    const searchLower = tableSearch.toLowerCase();
                    const visibleRecords = tableSearch
                      ? row.records.filter((r) =>
                          r.chrTicketNumbers?.toLowerCase().includes(searchLower) ||
                          r.clientName?.toLowerCase().includes(searchLower) ||
                          r.cipStatus?.toLowerCase().includes(searchLower)
                        )
                      : row.records;

                    return (
                      <Fragment key={row.product}>
                        {/* Product header row */}
                        <tr
                          onClick={() => toggleProduct(row.product)}
                          className={`cursor-pointer select-none hover:bg-indigo-900/10 transition-colors ${
                            i % 2 === 1 ? "bg-[#1a1f2e]/30" : ""
                          } ${isOpen ? "bg-indigo-950/20" : ""}`}
                        >
                          <td className="pl-4 py-3 w-8">
                            <svg
                              className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(row.product) }} />
                              <span className="text-gray-200 font-medium">{row.product}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.count.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-gray-200 font-medium tabular-nums">{row.count.toLocaleString()}</td>
                        </tr>

                        {/* Expanded sub-rows */}
                        {isOpen && (
                          <Fragment key={`${row.product}__expanded`}>
                            {/* Sub-header */}
                            <tr key={`${row.product}__subhdr`} className="bg-gray-900/80 border-t border-gray-700/50">
                              <td colSpan={4} className="px-0 py-0">
                                <div className="grid grid-cols-[2rem_1fr_1fr_1fr] text-xs font-semibold text-gray-500 uppercase tracking-wider pl-12 pr-5 py-2 gap-3">
                                  <span className="col-start-2">Incident No. / Date</span>
                                  <span>Client</span>
                                  <span>Status</span>
                                </div>
                              </td>
                            </tr>
                            {visibleRecords.length === 0 ? (
                              <tr key={`${row.product}__empty`} className="bg-gray-900/40">
                                <td colSpan={4} className="pl-12 py-3 text-xs text-gray-600 italic">
                                  {tableSearch ? "No incidents match search." : "No records."}
                                </td>
                              </tr>
                            ) : (
                              visibleRecords.map((r) => (
                                <tr key={r.id} className="bg-gray-900/40 hover:bg-gray-800/30 transition-colors border-t border-gray-800/40">
                                  <td colSpan={4} className="px-0 py-0">
                                    <div className="grid grid-cols-[2rem_1fr_1fr_1fr] items-center pl-12 pr-5 py-2.5 gap-3">
                                      <div className="col-start-2 flex flex-col gap-0.5 min-w-0">
                                        <span className="text-xs font-mono text-indigo-300 font-semibold truncate">
                                          {r.chrTicketNumbers || "—"}
                                        </span>
                                        <span className="text-[10px] text-gray-600">
                                          {r.submissionDate ? r.submissionDate.slice(0, 10) : "—"}
                                          {r.emergencyFlag && (
                                            <span className="ml-2 text-red-400 font-semibold">EMERGENCY</span>
                                          )}
                                        </span>
                                      </div>
                                      <span className="text-xs text-gray-300 truncate">
                                        {r.clientName || <span className="text-gray-600 italic">—</span>}
                                      </span>
                                      <span>
                                        {r.cipStatus ? (
                                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadgeClass(r.cipStatus)}`}>
                                            {r.cipStatus}
                                          </span>
                                        ) : (
                                          <span className="text-gray-600 text-xs italic">—</span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </Fragment>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-900">
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 font-bold text-white">Grand Total</td>
                    <td className="px-5 py-3 text-right font-bold text-white tabular-nums">{grandTotal.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-bold text-white tabular-nums">{grandTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
