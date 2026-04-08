"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from "recharts";

const PRODUCT_COLORS: Record<string, string> = {
  "omnia":                    "#6366F1",
  "omnia360":                 "#8B5CF6",
  "oasis fm":                 "#06B6D4",
  "advanced customer portal": "#F59E0B",
  "payment processor":        "#EF4444",
  "report writer":            "#10B981",
};

function colorFor(name: string): string {
  return PRODUCT_COLORS[name.toLowerCase()] ?? "#60a5fa";
}

interface DataPoint { name: string; value: number; color?: string; }
interface Props { data?: DataPoint[]; records?: { product: string }[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      const key = r.product?.trim() || "Blanks";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, value]) => ({ name, value, color: colorFor(name) }));
  }
  return [];
}

export default function CIPsByProduct(props: Props) {
  const data = buildData(props);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!data.length) {
    return (
      <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
        <div className="h-4 w-36 bg-gray-700 rounded animate-pulse mb-4" />
        <div className="h-[320px] flex items-center justify-center text-gray-600 text-sm">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">CIPs by Product</h3>
        <span className="text-xs font-semibold bg-indigo-900/50 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-800">
          {total.toLocaleString()} total
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 70 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#374151" vertical={false} />
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
            width={38}
          />
          <Tooltip
            cursor={{ fill: "#1f293780" }}
            contentStyle={{
              background: "#1F2937",
              border: "1px solid #374151",
              borderRadius: 8,
              color: "#ffffff",
              fontSize: 12,
            }}
            formatter={(v) => [Number(v).toLocaleString(), "CIPs"]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color ?? colorFor(entry.name)} fillOpacity={0.9} />
            ))}
            <LabelList dataKey="value" position="top" style={{ fill: "#9ca3af", fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
