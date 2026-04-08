"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from "recharts";

interface Props { records: { cipType: string }[]; }

export default function CIPsByTFS({ records }: Props) {
  const counts: Record<string, number> = {};
  for (const r of records) {
    const key = r.cipType?.trim() || "(blank)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));

  if (!data.length) return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center justify-center h-56 text-gray-600 text-sm">No data</div>;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-white mb-1">CIPs by Type (TFS)</h3>
      <p className="text-xs text-gray-500 mb-4">{records.length.toLocaleString()} total records</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: "#374151" }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} width={35} />
          <Tooltip cursor={{ fill: "#1f2937" }} contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#f9fafb" }} formatter={(v) => [Number(v).toLocaleString(), "Count"]} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((_, i) => <Cell key={i} fill="#fb923c" fillOpacity={0.85} />)}
            <LabelList dataKey="value" position="top" style={{ fill: "#9ca3af", fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
