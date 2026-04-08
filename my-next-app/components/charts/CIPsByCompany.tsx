"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from "recharts";

interface DataPoint { name: string; value: number; }
interface Props { data?: DataPoint[]; records?: { clientName: string }[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      const key = r.clientName?.trim() || "(blank)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, value]) => ({ name, value }));
  }
  return [];
}

export default function CIPsByCompany(props: Props) {
  const data = buildData(props);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!data.length) {
    return (
      <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
        <div className="h-4 w-40 bg-gray-700 rounded animate-pulse mb-4" />
        <div className="h-64 flex items-center justify-center text-gray-600 text-sm">No data available</div>
      </div>
    );
  }

  // Dynamic height: 40px per row + 80px padding
  const chartHeight = data.length * 44 + 60;

  return (
    <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">CIPs by Company</h3>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString()} total records</p>
        </div>
        <span className="text-xs font-semibold bg-emerald-900/40 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-800">
          {data.length} companies
        </span>
      </div>

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="#374151" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={220}
              tick={{ fill: "#d1d5db", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
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
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((_, i) => (
                <Cell key={i} fill="#10B981" fillOpacity={0.85} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                style={{ fill: "#9ca3af", fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
