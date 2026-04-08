"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
} from "recharts";

interface Props {
  records: { product: string; cipStatus: string }[];
}

const BAR_COLOR = "#60a5fa"; // blue-400

export default function CIPProductChart({ records }: Props) {
  // Tally by product
  const counts: Record<string, number> = {};
  for (const r of records) {
    const key = r.product?.trim() || "(blank)";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const data = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12) // cap at 12 bars
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center justify-center h-48 text-gray-600 text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">CIPs by Product</h3>
        <p className="text-xs text-gray-500 mt-0.5">{records.length.toLocaleString()} total records</p>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={35}
          />
          <Tooltip
            cursor={{ fill: "#1f2937" }}
            contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#f9fafb" }}
            formatter={(value) => [Number(value).toLocaleString(), "Count"]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLOR} fillOpacity={0.85} />
            ))}
            <LabelList dataKey="value" position="top" style={{ fill: "#9ca3af", fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
