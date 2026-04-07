"use client";

import { useEffect, useRef, useState } from "react";

export interface DateRange {
  from: string; // YYYY-MM-DD or ""
  to: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year",    days: 0, thisYear: true },
];

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function applyPreset(preset: typeof PRESETS[number]): DateRange {
  const now = new Date();
  const to  = toISO(now);
  if (preset.thisYear) {
    return { from: `${now.getFullYear()}-01-01`, to };
  }
  const from = new Date(now);
  from.setDate(from.getDate() - preset.days);
  return { from: toISO(from), to };
}

function label(range: DateRange) {
  if (!range.from && !range.to) return null;
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (range.from && range.to) return `${fmt(range.from)} – ${fmt(range.to)}`;
  if (range.from) return `From ${fmt(range.from)}`;
  return `Until ${fmt(range.to)}`;
}

export default function DateRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const ref = useRef<HTMLDivElement>(null);

  // Sync draft when parent clears the value
  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active = value.from || value.to;
  const summary = label(value);

  const apply = () => { onChange(draft); setOpen(false); };
  const clear  = () => { const empty = { from: "", to: "" }; setDraft(empty); onChange(empty); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          open
            ? "bg-gray-700 border-gray-600 text-white"
            : active
            ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:border-indigo-400"
            : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
        }`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className="max-w-[180px] truncate">{summary ?? "Date Range"}</span>
        {active && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="ml-1 text-indigo-400 hover:text-white transition-colors"
            title="Clear"
          >
            ×
          </span>
        )}
        <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 p-4 space-y-4">
          {/* Presets */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">Quick select</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => {
                const preset = applyPreset(p);
                const isActive = draft.from === preset.from && draft.to === preset.to;
                return (
                  <button
                    key={p.label}
                    onClick={() => setDraft(preset)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors text-left ${
                      isActive
                        ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-300"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom range */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">Custom range</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">From</label>
                <input
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">To</label>
                <input
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={clear}
              className="flex-1 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg py-2 transition-colors">
              Clear
            </button>
            <button onClick={apply}
              className="flex-1 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2 transition-colors">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
