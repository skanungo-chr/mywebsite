"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PRODUCT_COLORS: Record<string, string> = {
  "OMNIA":                    "#6366F1",
  "Omnia360":                 "#8B5CF6",
  "OASIS FM":                 "#06B6D4",
  "Advanced Customer Portal": "#F59E0B",
  "Payment Processor":        "#EF4444",
  "Report Writer":            "#10B981",
  "General Software":         "#3B82F6",
  "Data Warehouse":           "#F97316",
  "XML Invoice":              "#EC4899",
  "Other":                    "#6B7280",
};

const NORMALIZE: Record<string, string> = {
  "omnia":                     "OMNIA",
  "omnia360":                  "Omnia360",
  "oasis":                     "OASIS FM",
  "oasis fm":                  "OASIS FM",
  "advanced customer portal":  "Advanced Customer Portal",
  "acp":                       "Advanced Customer Portal",
  "payment processor":         "Payment Processor",
  "payment":                   "Payment Processor",
  "report writer":              "Report Writer",
  "general software":          "General Software",
  "data warehouse":            "Data Warehouse",
  "xml invoice":               "XML Invoice",
};

function normalizeProduct(raw: unknown): string {
  if (!raw || String(raw).trim() === "") return "Other";
  const trimmed = String(raw).trim();
  // exact match first
  if (PRODUCT_COLORS[trimmed]) return trimmed;
  // case-insensitive normalize
  return NORMALIZE[trimmed.toLowerCase()] ?? trimmed;
}

function colorFor(name: string): string {
  return PRODUCT_COLORS[name] ?? "#6B7280";
}

interface CIPLike {
  product?: string;
  cipType?: string;
  formStatus?: string;
}

interface DataPoint { name: string; value: number; color?: string; }
interface Props { data?: DataPoint[]; records?: CIPLike[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records && props.records.length > 0) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      // Try every possible field name
      const raw = r.product ?? "";
      const name = normalizeProduct(raw);
      counts[name] = (counts[name] ?? 0) + 1;
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
  const allOther = data.length === 1 && data[0].name === "Other";

  if (!data.length) {
    return (
      <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
        <div className="h-4 w-36 bg-gray-700 rounded animate-pulse mb-4" />
        <div className="h-[320px] flex flex-col items-center justify-center gap-2 text-gray-600 text-sm">
          <span>No product data found</span>
          <span className="text-xs text-gray-700">Check SharePoint sync is mapping Product field</span>
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

      {allOther && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-800/40 text-xs text-yellow-400">
          ⚠️ Product field is empty — run Sync from SharePoint to populate product data.
        </div>
      )}

      {/* Donut + center label */}
      <div className="relative" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={130}
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

      {/* Legend — 2 column grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 px-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color ?? colorFor(d.name) }} />
            <span className="text-xs text-gray-400 truncate">
              {d.name} <span className="text-gray-500">({d.value.toLocaleString()})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
