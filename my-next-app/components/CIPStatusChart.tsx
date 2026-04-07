"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  type ChartData,
  type TooltipItem,
} from "chart.js";

Chart.register(ArcElement, Tooltip, Legend, DoughnutController);

interface Props {
  records: { cipStatus: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  approved:     "#34d399", // emerald-400
  submitted:    "#60a5fa", // blue-400
  draft:        "#fbbf24", // yellow-400
  denied:       "#f87171", // red-400
  cancelled:    "#6b7280", // gray-500
  "rolled back":"#fb923c", // orange-400
  failed:       "#ef4444", // red-500
  successful:   "#10b981", // emerald-500
};

function colorFor(status: string) {
  return STATUS_COLORS[status.toLowerCase()] ?? "#818cf8"; // indigo-400 fallback
}

export default function CIPStatusChart({ records }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart<"doughnut"> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Tally by status
    const counts: Record<string, number> = {};
    for (const r of records) {
      const key = r.cipStatus || "Unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }

    // Sort by count desc
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels  = entries.map(([s]) => s);
    const data    = entries.map(([, n]) => n);
    const colors  = labels.map(colorFor);

    const chartData: ChartData<"doughnut"> = {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map((c) => c + "cc"), // 80% opacity
        borderColor:     colors,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    };

    if (chartRef.current) {
      chartRef.current.data = chartData;
      chartRef.current.update();
      return;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: chartData,
      options: {
        cutout: "70%",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "#9ca3af",      // gray-400
              font: { size: 12 },
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8,
              generateLabels(chart) {
                const ds = chart.data.datasets[0];
                const total = (ds.data as number[]).reduce((a, b) => a + b, 0);
                return (chart.data.labels as string[]).map((label, i) => ({
                  text: `${label}  ${ds.data[i]}  (${Math.round(((ds.data[i] as number) / total) * 100)}%)`,
                  fillStyle: (ds.backgroundColor as string[])[i],
                  strokeStyle: (ds.borderColor as string[])[i],
                  lineWidth: 1,
                  hidden: false,
                  index: i,
                  pointStyle: "circle" as const,
                }));
              },
            },
          },
          tooltip: {
            backgroundColor: "#1f2937",
            borderColor: "#374151",
            borderWidth: 1,
            titleColor: "#f9fafb",
            bodyColor: "#9ca3af",
            padding: 10,
            callbacks: {
              label(ctx: TooltipItem<"doughnut">) {
                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const pct   = Math.round(((ctx.parsed as number) / total) * 100);
                return `  ${ctx.parsed.toLocaleString()} records · ${pct}%`;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [records]);

  const total = records.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Status Distribution</h3>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString()} total records</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
          No data to display
        </div>
      ) : (
        <div className="relative h-56">
          <canvas ref={canvasRef} />
          {/* Centre label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-white tabular-nums">{total.toLocaleString()}</span>
            <span className="text-xs text-gray-500">CIPs</span>
          </div>
        </div>
      )}
    </div>
  );
}
