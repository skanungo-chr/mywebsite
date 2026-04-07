"use client";

import { useEffect, useRef, useState } from "react";

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:          { dot: "bg-blue-400",   badge: "bg-blue-900/40 text-blue-300 border-blue-700/40" },
  "in progress": { dot: "bg-yellow-400", badge: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40" },
  completed:     { dot: "bg-green-400",  badge: "bg-green-900/40 text-green-300 border-green-700/40" },
  closed:        { dot: "bg-gray-500",   badge: "bg-gray-700/60 text-gray-400 border-gray-600/40" },
};

function getStyle(status: string) {
  return STATUS_STYLES[status.toLowerCase()] ?? { dot: "bg-gray-500", badge: "bg-gray-700/60 text-gray-400 border-gray-600/40" };
}

interface Props {
  statuses: string[];
  value: string;
  onChange: (value: string) => void;
}

export default function StatusFilter({ statuses, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (s: string) => { onChange(s); setOpen(false); };

  const style = value ? getStyle(value) : null;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          open
            ? "bg-gray-700 border-gray-600 text-white"
            : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
        }`}
      >
        {value && style ? (
          <>
            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
            <span className="font-medium">{value}</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            <span>Status</span>
          </>
        )}
        <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-30">
          {/* All option */}
          <button
            onClick={() => select("")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
              value === "" ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />
            All Statuses
            {value === "" && <svg className="w-3.5 h-3.5 ml-auto text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
          </button>

          {statuses.length > 0 && <div className="border-t border-gray-800" />}

          {statuses.map((s) => {
            const st = getStyle(s);
            const active = value.toLowerCase() === s.toLowerCase();
            return (
              <button
                key={s}
                onClick={() => select(s)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  active ? "bg-indigo-600/20 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.badge}`}>{s}</span>
                {active && <svg className="w-3.5 h-3.5 ml-auto text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
