"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PRODUCT_COLORS: Record<string, string> = {
  "omnia":                    "#6366F1",
  "omnia360":                 "#8B5CF6",
  "oasis fm":                 "#06B6D4",
  "advanced customer portal": "#F59E0B",
  "payment processor":        "#EF4444",
  "report writer":            "#10B981",
};

function colorFor(name: string): string {
  return PRODUCT_COLORS[name.toLowerCase()] ?? "#6B7280";
}

interface DataPoint { name: string; value: number; color?: string; }
interface Props { data?: DataPoint[]; records?: { product: string }[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      const key = r.product?.trim() || "Other";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
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
        <div className="h-[320px] flex items-center justify-center text-gray-600 text-sm">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">CIPs by Product</h3>
        <span className="text-xs font-semibold bg-indigo-900/50 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-800">
          {total.toLocaleString()} total
        </span>
      </div>

      {/* Donut + center label */}
      <div className="relative" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              dataKey="value"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color ?? colorFor(entry.name)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#1F2937",
                border: "1px solid #374151",
                borderRadius: 8,
                color: "#ffffff",
                fontSize: 12,
              }}
              formatter={(v, name) => [`${Number(v).toLocaleString()} CIPs`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-white tabular-nums">{total.toLocaleString()}</span>
          <span className="text-xs text-gray-500 mt-0.5">CIPs</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2 px-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: d.color ?? colorFor(d.name) }}
            />
            <span className="text-xs text-gray-400">
              {d.name}{" "}
              <span className="text-gray-500">({d.value.toLocaleString()})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
