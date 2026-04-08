"use client";

import { useEffect, useRef, useState } from "react";

interface SingleProps {
  multi?: false;
  label: string;
  options: { value: string; label: string; dot?: string }[];
  value: string;
  onChange: (value: string) => void;
}

interface MultiProps {
  multi: true;
  label: string;
  options: { value: string; label: string; dot?: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}

type Props = SingleProps | MultiProps;

export default function FilterDropdown(props: Props) {
  const { label, options } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mouseHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", mouseHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", mouseHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  // ── Single-select helpers ──────────────────────────────────────────────────
  const singleValue  = props.multi ? "" : props.value;
  const singleSelect = (v: string) => {
    if (!props.multi) { props.onChange(v); setOpen(false); }
  };

  // ── Multi-select helpers ───────────────────────────────────────────────────
  const multiValues = props.multi ? props.value : [];
  const toggleMulti = (v: string) => {
    if (!props.multi) return;
    const next = multiValues.includes(v)
      ? multiValues.filter((x) => x !== v)
      : [...multiValues, v];
    props.onChange(next);
  };
  const clearMulti = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (props.multi) props.onChange([]);
  };
  const selectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (props.multi) props.onChange(options.map((o) => o.value));
  };
  const allSelected  = props.multi && multiValues.length === options.length && options.length > 0;
  const noneSelected = multiValues.length === 0;

  const isActive = props.multi ? multiValues.length > 0 : !!singleValue;
  const selected  = !props.multi ? options.find((o) => o.value === singleValue) : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          open
            ? "bg-gray-700 border-gray-600 text-white"
            : isActive
            ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-300 hover:border-indigo-400"
            : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
        }`}
      >
        {/* Single-select: show selected label */}
        {!props.multi && selected ? (
          <>
            {selected.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${selected.dot}`} />}
            <span className="font-medium">{selected.label}</span>
          </>
        ) : !props.multi ? (
          <>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            <span>{label}</span>
          </>
        ) : (
          /* Multi-select: show label + count badge */
          <>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            <span>{label}</span>
            {multiValues.length > 0 && !allSelected && (
              <>
                <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {multiValues.length}
                </span>
                <span
                  role="button"
                  onClick={clearMulti}
                  className="ml-0.5 text-indigo-300 hover:text-white transition-colors text-xs"
                  title="Clear"
                >
                  ✕
                </span>
              </>
            )}
          </>
        )}

        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 min-w-[220px] bg-[#1a1f2e] border border-gray-700 rounded-xl shadow-2xl z-30 overflow-hidden flex flex-col max-h-80">

          {/* ── Single-select "All" option ── */}
          {!props.multi && (
            <>
              <button
                onClick={() => singleSelect("")}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  !singleValue ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />
                All {label}s
                {!singleValue && (
                  <svg className="w-3.5 h-3.5 ml-auto text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
              {options.length > 0 && <div className="border-t border-gray-800" />}
            </>
          )}

          {/* ── Multi-select header ── */}
          {props.multi && options.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 gap-2">
              <span className="text-xs text-gray-500 shrink-0">
                {noneSelected
                  ? "All shown"
                  : allSelected
                  ? `All ${options.length} selected`
                  : `${multiValues.length} of ${options.length} selected`}
              </span>
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                {!allSelected && (
                  <button onClick={selectAll} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                    Select all
                  </button>
                )}
                {!allSelected && !noneSelected && (
                  <span className="text-gray-600">|</span>
                )}
                {!noneSelected && (
                  <button onClick={clearMulti} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Options ── */}
          <div className="overflow-y-auto flex-1">
          {options.map((opt) => {
            if (props.multi) {
              const checked = multiValues.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleMulti(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                    checked ? "bg-indigo-600/15 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {/* Checkbox */}
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked ? "bg-indigo-600 border-indigo-500" : "border-gray-600 bg-gray-800"
                  }`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  {opt.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />}
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            }

            // Single-select option
            const active = singleValue === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => singleSelect(opt.value)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  active ? "bg-indigo-600/20 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {opt.dot
                  ? <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                  : <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />}
                <span className="truncate">{opt.label}</span>
                {active && (
                  <svg className="w-3.5 h-3.5 ml-auto shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
