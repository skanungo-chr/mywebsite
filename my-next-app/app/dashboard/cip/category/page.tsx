"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchCIPRecordsOnce } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from "recharts";

const CIP_STATUSES = [
  "Approved",
  "Denied",
  "Draft",
  "Submitted",
  "Successful",
  "Cancelled",
  "Rolled Back",
  "Failed",
];

export default function CIPsByCategoryPage() {
  const [records, setRecords]               = useState<CIPRecord[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("All");
  const [selectedFormStatus, setSelectedFormStatus] = useState("All");

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

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const matchStatus =
        selectedStatuses.length === 0 ||
        selectedStatuses.some((s) => r.cipStatus?.toLowerCase() === s.toLowerCase());
      const matchClient =
        selectedClient === "All" || r.clientName === selectedClient;
      const matchType =
        selectedFormStatus === "All" || r.cipType === selectedFormStatus;
      return matchStatus && matchClient && matchType;
    });
  }, [records, selectedStatuses, selectedClient, selectedFormStatus]);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const key = r.product?.trim() || "(blank)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([product, count]) => ({ product, count }));
  }, [filtered]);

  const grandTotal = filtered.length;

  const kpi = useMemo(() => ({
    total:      filtered.length,
    approved:   filtered.filter((r) => r.cipStatus?.toLowerCase() === "approved").length,
    successful: filtered.filter((r) => r.cipStatus?.toLowerCase() === "successful").length,
    denied:     filtered.filter((r) => r.cipStatus?.toLowerCase() === "denied").length,
  }), [filtered]);

  const hasFilters =
    selectedStatuses.length > 0 || selectedClient !== "All" || selectedFormStatus !== "All";

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedClient("All");
    setSelectedFormStatus("All");
  };

  const handleStatusToggle = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["Product", "Count"],
      ...chartData.map((d) => [d.product, d.count]),
      ["Grand Total", grandTotal],
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
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
          <p className="text-sm text-gray-500 mt-0.5">Product distribution analysis</p>
        </div>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Reset Filters
            </button>
          )}
          <button
            onClick={handleExportCSV}
            disabled={loading || chartData.length === 0}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total CIPs",  value: kpi.total,      color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
          { label: "Approved",    value: kpi.approved,   color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20"  },
          { label: "Successful",  value: kpi.successful, color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/20" },
          { label: "Denied",      value: kpi.denied,     color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20"    },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
            {loading ? (
              <div className="h-8 w-16 bg-gray-700 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color} tabular-nums`}>{value.toLocaleString()}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Main layout: left filters + right content */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Left panel: CIP Status checkboxes ── */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">CIP Status</span>
              <div className="flex items-center gap-2">
                {selectedStatuses.length > 0 && (
                  <span className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                    {selectedStatuses.length}
                  </span>
                )}
                {selectedStatuses.length > 0 && (
                  <button
                    onClick={() => setSelectedStatuses([])}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    title="Clear"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
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
                    <label key={status} className="flex items-center gap-2.5 cursor-pointer group">
                      <div
                        onClick={() => handleStatusToggle(status)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                          checked
                            ? "bg-indigo-600 border-indigo-500"
                            : "bg-gray-800 border-gray-600 group-hover:border-gray-400"
                        }`}
                      >
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span
                        onClick={() => handleStatusToggle(status)}
                        className={`text-sm transition-colors cursor-pointer select-none ${
                          checked ? "text-white font-medium" : "text-gray-400 group-hover:text-gray-200"
                        }`}
                      >
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

        {/* ── Right panel: dropdowns + chart + table ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Top filter row */}
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">Client Name</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                disabled={loading}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="All">(All)</option>
                {clientNames.map((n) => (
                  <option key={n} value={n} className="bg-gray-900">{n}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs text-gray-500 font-medium">CIP Type (formStatus)</label>
              <select
                value={selectedFormStatus}
                onChange={(e) => setSelectedFormStatus(e.target.value)}
                disabled={loading}
                className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full disabled:opacity-50 cursor-pointer"
              >
                <option value="All">(All)</option>
                {formStatuses.map((f) => (
                  <option key={f} value={f} className="bg-gray-900">{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bar chart */}
          {loading ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="h-4 w-40 bg-gray-700 rounded animate-pulse mb-4" />
              <div className="h-72 bg-gray-800/50 rounded animate-pulse" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
              <div className="h-72 flex flex-col items-center justify-center gap-3 text-gray-600">
                <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-sm">No records match the selected filters</span>
                {hasFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                  >
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
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartData}
                  margin={{ top: 24, right: 16, left: 0, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="product"
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={80}
                    tickLine={false}
                    axisLine={{ stroke: "#374151" }}
                  />
                  <YAxis
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1F2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 12,
                    }}
                    formatter={(v) => [`${Number(v).toLocaleString()} CIPs`, "Count"]}
                  />
                  <Bar dataKey="count" fill="#4472C4" radius={[4, 4, 0, 0]} maxBarSize={64}>
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{ fill: "#9CA3AF", fontSize: 11, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pivot table */}
          {!loading && chartData.length > 0 && (
            <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Products
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      NA
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Grand Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {chartData.map((row, i) => (
                    <tr
                      key={row.product}
                      className={`hover:bg-gray-800/40 transition-colors ${i % 2 === 1 ? "bg-[#1a1f2e]/30" : ""}`}
                    >
                      <td className="px-5 py-3 text-gray-300">{row.product}</td>
                      <td className="px-5 py-3 text-right text-gray-400 tabular-nums">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-200 font-medium tabular-nums">
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-900">
                    <td className="px-5 py-3 font-bold text-white">Grand Total</td>
                    <td className="px-5 py-3 text-right font-bold text-white tabular-nums">
                      {grandTotal.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-white tabular-nums">
                      {grandTotal.toLocaleString()}
                    </td>
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
