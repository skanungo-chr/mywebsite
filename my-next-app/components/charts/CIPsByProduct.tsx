"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

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
  "report writer":             "Report Writer",
  "general software":          "General Software",
  "data warehouse":            "Data Warehouse",
  "xml invoice":               "XML Invoice",
};

function normalizeProduct(raw: unknown): string {
  if (!raw || String(raw).trim() === "") return "Other";
  const trimmed = String(raw).trim();
  if (PRODUCT_COLORS[trimmed]) return trimmed;
  return NORMALIZE[trimmed.toLowerCase()] ?? trimmed;
}

function colorFor(name: string): string {
  return PRODUCT_COLORS[name] ?? "#6B7280";
}

interface CIPLike { product?: string; cipType?: string; formStatus?: string; }
interface DataPoint { name: string; value: number; color?: string; }
interface Props { data?: DataPoint[]; records?: CIPLike[]; }

function buildData(props: Props): DataPoint[] {
  if (props.data && props.data.length > 0) return props.data;
  if (props.records && props.records.length > 0) {
    const counts: Record<string, number> = {};
    for (const r of props.records) {
      const name = normalizeProduct(r.product ?? "");
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

  const chartHeight = data.length * 44 + 60;

  return (
    <div className="bg-[#111827] rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">CIPs by Product</h3>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString()} total records</p>
        </div>
        <span className="text-xs font-semibold bg-indigo-900/50 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-800">
          {data.length} products
        </span>
      </div>

      {allOther && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-800/40 text-xs text-yellow-400">
          ⚠️ Product field is empty — run Sync from SharePoint to populate product data.
        </div>
      )}

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
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
              width={180}
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
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color ?? colorFor(entry.name)} />
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
