"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from "recharts";

interface Props { records: { submissionDate: string }[]; }

export default function CIPsMonthlyTrend({ records }: Props) {
  const counts: Record<string, number> = {};
  for (const r of records) {
    if (!r.submissionDate) continue;
    const month = r.submissionDate.slice(0, 7); // "YYYY-MM"
    counts[month] = (counts[month] ?? 0) + 1;
  }
  const data = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24) // last 24 months
    .map(([month, value]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      value,
    }));

  if (!data.length) return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center justify-center h-56 text-gray-600 text-sm">No data</div>;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-white mb-1">Monthly CIP Trend</h3>
      <p className="text-xs text-gray-500 mb-4">{records.length.toLocaleString()} total records</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: "#374151" }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} width={35} />
          <Tooltip cursor={{ stroke: "#374151" }} contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#f9fafb" }} formatter={(v) => [Number(v).toLocaleString(), "CIPs"]} />
          <Line type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2} dot={<Dot r={3} fill="#818cf8" />} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
