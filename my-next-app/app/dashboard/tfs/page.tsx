"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { fetchCIPRecordsOnce } from "@/lib/firestore";
import { CIPRecord } from "@/lib/cip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TFSWorkItem {
  id:           number;
  title:        string;
  status:       string;
  type:         string;
  assignedTo:   string;
  foundInBuild: string;
  fixedInBuild: string;
  createdDate:  string | null;
  changedDate:  string | null;
  areaPath:     string;
  iteration:    string;
  tags:         string;
  tfsUrl:       string;
}

type ErrorCode = "NO_PAT" | "INVALID_PAT" | "NETWORK" | "CORS" | "METHOD_NOT_ALLOWED" | "OTHER" | null;

// ─── Config (NEXT_PUBLIC_ — embedded in browser bundle at build time) ─────────

const TFS_URL        = (process.env.NEXT_PUBLIC_TFS_URL        ?? "https://ado.chrsolutions.com/tfs").replace(/\/+$/, "").trim();
const TFS_COLLECTION = (process.env.NEXT_PUBLIC_TFS_COLLECTION ?? "CHR").trim();
const TFS_PROJECT    = (process.env.NEXT_PUBLIC_TFS_PROJECT    ?? "Omnia360Suite").trim();
const TFS_API_VER    = (process.env.NEXT_PUBLIC_TFS_API_VERSION ?? "6.0").trim();
const TFS_ENV_PAT    =  process.env.NEXT_PUBLIC_TFS_PAT        ?? "";
const PAT_OVERRIDE_KEY = "tfs_pat_override";

const TFS_FIELDS = [
  "System.Id", "System.Title", "System.State", "System.WorkItemType",
  "System.AssignedTo", "System.CreatedDate", "System.ChangedDate",
  "Microsoft.VSTS.Build.FoundIn", "Microsoft.VSTS.Build.IntegrationBuild",
  "System.Tags", "System.AreaPath", "System.IterationPath",
].join(",");

const MAX_REPORTING_ITEMS = 2000;

// ─── Date range ───────────────────────────────────────────────────────────────

const DATE_RANGE_OPTIONS = [
  { label: "1 month",   months: 1  },
  { label: "3 months",  months: 3  },
  { label: "6 months",  months: 6  },
  { label: "12 months", months: 12 },
  { label: "24 months", months: 24 },
  { label: "All time",  months: 0  },
] as const;

type DateRangeMonths = typeof DATE_RANGE_OPTIONS[number]["months"];

// ─── PAT helpers ──────────────────────────────────────────────────────────────

function getActivePAT(): string {
  if (typeof window === "undefined") return TFS_ENV_PAT;
  return (localStorage.getItem(PAT_OVERRIDE_KEY) ?? TFS_ENV_PAT).trim();
}
function buildAuthHeader(pat: string): string { return `Basic ${btoa(`:${pat}`)}`; }

// ─── Map raw API item → TFSWorkItem ───────────────────────────────────────────

function mapWorkItem(raw: Record<string, unknown>): TFSWorkItem | null {
  // Support both nested { fields: {...} } and flat format from reporting API
  const f = (typeof raw.fields === "object" && raw.fields !== null ? raw.fields : raw) as Record<string, unknown>;
  const id = Number(raw.id ?? f["System.Id"]);
  if (!id) return null;
  const assigned = f["System.AssignedTo"];
  const assignedTo = assigned
    ? typeof assigned === "object"
      ? String((assigned as Record<string, unknown>).displayName ?? "Unassigned")
      : String(assigned).replace(/<[^>]+>/g, "").trim() || "Unassigned"
    : "Unassigned";
  return {
    id,
    title:        String(f["System.Title"]                          ?? ""),
    status:       String(f["System.State"]                          ?? ""),
    type:         String(f["System.WorkItemType"]                   ?? ""),
    assignedTo,
    foundInBuild: String(f["Microsoft.VSTS.Build.FoundIn"]          ?? ""),
    fixedInBuild: String(f["Microsoft.VSTS.Build.IntegrationBuild"] ?? ""),
    createdDate:  f["System.CreatedDate"] ? String(f["System.CreatedDate"]) : null,
    changedDate:  f["System.ChangedDate"] ? String(f["System.ChangedDate"]) : null,
    areaPath:     String(f["System.AreaPath"]      ?? ""),
    iteration:    String(f["System.IterationPath"] ?? ""),
    tags:         String(f["System.Tags"]          ?? ""),
    tfsUrl:       `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_workitems/edit/${id}`,
  };
}

// ─── GET batch fetch by IDs ───────────────────────────────────────────────────

async function fetchTFSItemsByIds(ids: number[], auth: string): Promise<TFSWorkItem[]> {
  if (ids.length === 0) return [];
  const all: TFSWorkItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const url =
      `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/wit/workitems` +
      `?ids=${batch.join(",")}` +
      `&fields=${TFS_FIELDS}` +
      `&errorPolicy=omit` +
      `&api-version=${TFS_API_VER}`;
    const res = await fetch(url, { method: "GET", headers: { Authorization: auth, Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("INVALID_PAT"), { code: "INVALID_PAT" });
    if (res.status === 405) throw Object.assign(new Error("TFS_METHOD_NOT_ALLOWED"), { code: "METHOD_NOT_ALLOWED" });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`TFS ${res.status}: ${t.slice(0, 200)}`); }
    const data = await res.json() as { value?: unknown[] };
    for (const raw of (data.value ?? []) as Record<string, unknown>[]) {
      const item = mapWorkItem(raw); if (item) all.push(item);
    }
    if (i + 200 < ids.length) await new Promise(r => setTimeout(r, 250));
  }
  return all;
}

// ─── Strategy 1: Reporting API ────────────────────────────────────────────────
// Collection-level GET endpoint — requires CORS on /{collection}/_apis/ path.
// Falls through if CORS blocks it.

async function fetchViaReportingAPI(months: DateRangeMonths, auth: string): Promise<TFSWorkItem[]> {
  const fromDate = months > 0
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 19) + "Z"; })()
    : "2020-01-01T00:00:00Z";

  const baseUrls = [
    `${TFS_URL}/${TFS_COLLECTION}/_apis/wit/reporting/workitems`,
    `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/wit/reporting/workitems`,
  ];

  let lastError = "";
  for (const baseUrl of baseUrls) {
    try {
      const items: TFSWorkItem[] = [];
      let token: string | null = null;
      let isLast = false;
      do {
        const params = new URLSearchParams({ startDateTime: fromDate, project: TFS_PROJECT, fields: TFS_FIELDS, "api-version": "2.0" });
        if (token) params.set("continuationToken", token);
        const res = await fetch(`${baseUrl}?${params}`, { method: "GET", headers: { Authorization: auth, Accept: "application/json" } });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error("INVALID_PAT"), { code: "INVALID_PAT" });
        if (res.status === 405) throw Object.assign(new Error("TFS_METHOD_NOT_ALLOWED"), { code: "METHOD_NOT_ALLOWED" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { values?: Record<string, unknown>[]; isLastBatch?: boolean; continuationToken?: string; nextLink?: string };
        for (const v of data.values ?? []) { const i = mapWorkItem(v); if (i) items.push(i); }
        isLast = data.isLastBatch ?? true;
        token = data.continuationToken ?? null;
        if (!token && data.nextLink) { const m = data.nextLink.match(/continuationToken=([^&]+)/i); token = m ? decodeURIComponent(m[1]) : null; }
        if (items.length >= MAX_REPORTING_ITEMS) return items;
      } while (!isLast && token);
      return items;
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "INVALID_PAT" || e.code === "METHOD_NOT_ALLOWED") throw err;
      lastError = e.message;
    }
  }
  throw new Error(`Reporting API: ${lastError}`);
}

// ─── Strategy 2: Saved WIQL query via GET ────────────────────────────────────
// GET /{collection}/{project}/_apis/wit/queries/Shared Queries?$depth=3
// → find flat-list queries → run via GET /_apis/wit/wiql/{id}
// Same project-level path as workitems → CORS already allows it.

interface TFSQueryNode { id: string; name: string; queryType?: string; isFolder?: boolean; hasChildren?: boolean; children?: TFSQueryNode[] }

function collectFlatQueries(node: TFSQueryNode): TFSQueryNode[] {
  const results: TFSQueryNode[] = [];
  if (!node.isFolder && node.queryType === "flat") results.push(node);
  for (const child of node.children ?? []) results.push(...collectFlatQueries(child));
  return results;
}

async function fetchViaSharedQuery(months: DateRangeMonths, auth: string): Promise<TFSWorkItem[]> {
  // Step 1 — list shared queries (project-level, CORS works)
  const qUrl =
    `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/wit/queries/Shared%20Queries` +
    `?$depth=3&$expand=minimal&api-version=${TFS_API_VER}`;
  const qRes = await fetch(qUrl, { method: "GET", headers: { Authorization: auth, Accept: "application/json" } });
  if (qRes.status === 401 || qRes.status === 403) throw Object.assign(new Error("INVALID_PAT"), { code: "INVALID_PAT" });
  if (!qRes.ok) throw new Error(`Queries list HTTP ${qRes.status}`);

  const qData = await qRes.json() as TFSQueryNode;
  const flatQueries = collectFlatQueries(qData);
  if (flatQueries.length === 0) throw new Error("No flat-list shared queries found in TFS");

  // Step 2 — run each flat query via GET until one returns items
  const cutoff = months > 0 ? (() => { const d = new Date(); d.setMonth(d.getMonth() - months); return d; })() : null;
  let lastErr = "";

  for (const query of flatQueries) {
    try {
      const wUrl =
        `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/wit/wiql/${query.id}` +
        `?$top=${MAX_REPORTING_ITEMS}&api-version=${TFS_API_VER}`;
      const wRes = await fetch(wUrl, { method: "GET", headers: { Authorization: auth, Accept: "application/json" } });
      if (wRes.status === 401 || wRes.status === 403) throw Object.assign(new Error("INVALID_PAT"), { code: "INVALID_PAT" });
      if (!wRes.ok) { lastErr = `wiql HTTP ${wRes.status}`; continue; }
      const wData = await wRes.json() as { workItems?: { id: number }[] };
      const ids = (wData.workItems ?? []).map(w => w.id);
      if (ids.length === 0) continue;

      const items = await fetchTFSItemsByIds(ids, auth);
      // Client-side date filter
      return cutoff ? items.filter(i => !i.changedDate || new Date(i.changedDate) >= cutoff) : items;
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "INVALID_PAT") throw err;
      lastErr = e.message;
    }
  }
  throw new Error(`Saved queries failed: ${lastErr}`);
}

// ─── Combined fetch strategy ──────────────────────────────────────────────────
// 1. Reporting API   (GET, date-range native)
// 2. Shared WIQL query via GET  (project-level, CORS safe)
// 3. CIP-linked IDs fallback (always works)
// CIP-linked IDs are always merged into whichever strategy succeeds.

async function fetchAllTFSData(months: DateRangeMonths, cipIds: number[]): Promise<{
  items: TFSWorkItem[];
  usedFallback: boolean;
  fallbackReason: string;
  capped: boolean;
}> {
  const pat = getActivePAT();
  if (!pat) throw Object.assign(new Error("NO_PAT"), { code: "NO_PAT" });
  const auth = buildAuthHeader(pat);

  const strategies: Array<{ name: string; fn: () => Promise<TFSWorkItem[]> }> = [
    { name: "Reporting API", fn: () => fetchViaReportingAPI(months, auth) },
    { name: "Saved Query",   fn: () => fetchViaSharedQuery(months, auth) },
  ];

  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      const rangeItems = await strategy.fn();
      // Merge CIP-linked IDs that might be outside the date range
      const byId = new Map(rangeItems.map(i => [i.id, i]));
      const missing = cipIds.filter(id => !byId.has(id));
      if (missing.length > 0) {
        const extra = await fetchTFSItemsByIds(missing, auth);
        for (const item of extra) byId.set(item.id, item);
      }
      return { items: [...byId.values()], usedFallback: false, fallbackReason: "", capped: rangeItems.length >= MAX_REPORTING_ITEMS };
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "INVALID_PAT" || e.code === "METHOD_NOT_ALLOWED") throw err;
      errors.push(`${strategy.name}: ${e.message}`);
    }
  }

  // All strategies failed — fall back to CIP-linked IDs only
  const fallbackItems = await fetchTFSItemsByIds(cipIds, auth);
  return { items: fallbackItems, usedFallback: true, fallbackReason: errors.join(" | "), capped: false };
}

// ─── CIP helpers ──────────────────────────────────────────────────────────────

function extractCIPTFSIds(cips: CIPRecord[]): number[] {
  const ids = new Set<number>();
  for (const c of cips) {
    const m = String(c.chrTicketNumbers ?? "").match(/\d{4,6}/g);
    if (m) for (const x of m) ids.add(parseInt(x, 10));
  }
  return [...ids];
}

function buildCipMap(cips: CIPRecord[]): Record<number, CIPRecord[]> {
  const map: Record<number, CIPRecord[]> = {};
  for (const c of cips) {
    const m = String(c.chrTicketNumbers ?? "").match(/\d{4,6}/g);
    if (m) for (const x of m) {
      const id = parseInt(x, 10);
      (map[id] ??= []).push(c);
    }
  }
  return map;
}

function buildTfsMap(cips: CIPRecord[], tfsById: Record<number, TFSWorkItem>): Record<string, TFSWorkItem[]> {
  const map: Record<string, TFSWorkItem[]> = {};
  for (const c of cips) {
    const m = String(c.chrTicketNumbers ?? "").match(/\d{4,6}/g);
    if (!m) continue;
    const items = m.map(x => tfsById[parseInt(x, 10)]).filter((x): x is TFSWorkItem => !!x);
    if (items.length) map[c.id] = items;
  }
  return map;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

function timeAgo(s: string | null): string {
  if (!s) return "—";
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`; if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}yr ago`;
}

function statusBadgeClass(s: string) {
  const l = s.toLowerCase();
  if (l === "active") return "bg-yellow-900/40 text-yellow-300 border-yellow-700/50";
  if (l === "closed" || l === "resolved") return "bg-green-900/40 text-green-300 border-green-700/50";
  if (l === "new") return "bg-gray-700/60 text-gray-300 border-gray-600/50";
  if (l === "in progress") return "bg-cyan-900/40 text-cyan-300 border-cyan-700/50";
  if (l === "code complete") return "bg-blue-900/40 text-blue-300 border-blue-700/50";
  return "bg-gray-800/60 text-gray-400 border-gray-600/50";
}

function typeBadgeClass(t: string) {
  const l = t.toLowerCase();
  if (l === "bug") return "bg-red-900/30 text-red-300 border-red-700/50";
  if (l === "user story") return "bg-blue-900/30 text-blue-300 border-blue-700/50";
  if (l === "task") return "bg-purple-900/30 text-purple-300 border-purple-700/50";
  return "bg-gray-800/60 text-gray-400 border-gray-600/50";
}

function shortenArea(area: string) {
  const p = area.split("\\"); return p.length > 2 ? `…\\${p.slice(-2).join("\\")}` : area;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800/60 animate-pulse">
      {[12, 18, 48, 18, 24, 20, 20, 10, 14].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 bg-gray-700 rounded" style={{ width: `${w * 4}px` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── PAT Override Panel ───────────────────────────────────────────────────────

function PATOverridePanel({ onSaved }: { onSaved: () => void }) {
  const [pat, setPat]     = useState("");
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);
  const hasSaved = typeof window !== "undefined" && !!localStorage.getItem(PAT_OVERRIDE_KEY);

  const handleSave = () => {
    if (!pat.trim()) return;
    localStorage.setItem(PAT_OVERRIDE_KEY, pat.trim());
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved(); }, 800);
  };
  const handleClear = () => { localStorage.removeItem(PAT_OVERRIDE_KEY); setPat(""); onSaved(); };

  return (
    <details className="mt-3">
      <summary className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer select-none">
        Override PAT (optional — use your own token)
      </summary>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <input type={show ? "text" : "password"} value={pat} onChange={e => setPat(e.target.value)}
            placeholder={hasSaved ? "Override PAT saved — enter new to replace" : "Paste your personal PAT…"}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-indigo-500 font-mono placeholder:text-gray-600" />
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {show
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
              }
            </svg>
          </button>
        </div>
        <button onClick={handleSave} disabled={!pat.trim()}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors">
          {saved ? "Saved!" : "Save"}
        </button>
        {hasSaved && (
          <button onClick={handleClear}
            className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 px-3 py-2 rounded-lg transition-colors">
            Clear
          </button>
        )}
      </div>
    </details>
  );
}

// ─── Version Summary ──────────────────────────────────────────────────────────

function VersionSummary({ tfsItems, cipMap }: { tfsItems: TFSWorkItem[]; cipMap: Record<number, CIPRecord[]> }) {
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const buildData: Record<string, { tfsCount: number; cipSet: Set<string> }> = {};
    for (const item of tfsItems) {
      const build = item.fixedInBuild || "Not Assigned";
      if (!buildData[build]) buildData[build] = { tfsCount: 0, cipSet: new Set() };
      buildData[build].tfsCount++;
      for (const cip of cipMap[item.id] ?? []) buildData[build].cipSet.add(cip.id);
    }
    return Object.entries(buildData)
      .map(([build, d]) => ({ build, tfsCount: d.tfsCount, cipCount: d.cipSet.size }))
      .sort((a, b) => {
        if (a.build === "Not Assigned") return 1;
        if (b.build === "Not Assigned") return -1;
        return b.tfsCount - a.tfsCount;
      });
  }, [tfsItems, cipMap]);

  if (rows.length === 0) return null;

  return (
    <div className="mb-5">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white mb-2 w-full text-left">
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Version Summary
        <span className="text-xs font-normal text-gray-500">({rows.length} builds)</span>
      </button>
      {open && (
        <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Build / Version</th>
                <th className="px-4 py-3 text-right font-semibold">TFS Items</th>
                <th className="px-4 py-3 text-right font-semibold">CIP Incidents</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.build} className="border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{r.build}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums text-xs">{r.tfsCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {r.cipCount > 0
                      ? <span className="text-indigo-400 font-medium">{r.cipCount}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CIP Incidents Panel ──────────────────────────────────────────────────────

function CIPIncidentsPanel({
  cipRecords,
  tfsMap,
  onOpenItem,
}: {
  cipRecords: CIPRecord[];
  tfsMap: Record<string, TFSWorkItem[]>;
  onOpenItem: (item: TFSWorkItem) => void;
}) {
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  const cipWithTFS = useMemo(() =>
    cipRecords.filter(c => (tfsMap[c.id]?.length ?? 0) > 0),
    [cipRecords, tfsMap]
  );

  const filtered = useMemo(() => {
    if (!search) return cipWithTFS;
    const q = search.toLowerCase();
    return cipWithTFS.filter(c =>
      (c.clientName ?? "").toLowerCase().includes(q) ||
      (c.chrTicketNumbers ?? "").toLowerCase().includes(q) ||
      (c.cipStatus ?? "").toLowerCase().includes(q) ||
      (c.cipType ?? "").toLowerCase().includes(q)
    );
  }, [cipWithTFS, search]);

  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input type="text" placeholder="Search incidents, clients, ticket numbers…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
        </div>
        <span className="text-xs text-gray-500 shrink-0">{filtered.length} incidents with TFS links</span>
      </div>

      <div className="space-y-2">
        {filtered.map(cip => {
          const items = tfsMap[cip.id] ?? [];
          const isOpen = expanded.has(cip.id);
          return (
            <div key={cip.id} className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden">
              <button onClick={() => toggle(cip.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <svg className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-white truncate">{cip.clientName || "—"}</span>
                    {cip.chrTicketNumbers && (
                      <span className="ml-2 text-xs text-gray-500 font-mono">{cip.chrTicketNumbers}</span>
                    )}
                    {cip.cipType && (
                      <span className="ml-2 text-xs text-gray-600">{cip.cipType}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(cip.cipStatus ?? "")}`}>
                    {cip.cipStatus || "—"}
                  </span>
                  <span className="text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full font-medium">
                    {items.length} TFS
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 p-4 space-y-3">
                  {items.map(tfs => (
                    <div key={tfs.id} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => onOpenItem(tfs)}
                            className="text-indigo-400 hover:text-indigo-300 font-mono font-medium text-sm hover:underline">
                            TFS #{tfs.id}
                          </button>
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${typeBadgeClass(tfs.type)}`}>{tfs.type}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${statusBadgeClass(tfs.status)}`}>{tfs.status}</span>
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{timeAgo(tfs.changedDate)}</span>
                      </div>
                      <p className="text-sm text-gray-200 mb-3 leading-snug">{tfs.title}</p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                        <div className="flex gap-1.5">
                          <span className="text-gray-500 shrink-0">Found In:</span>
                          <span className="text-gray-300">{tfs.foundInBuild || <span className="italic text-gray-600">Build not specified</span>}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-500 shrink-0">Fixed In:</span>
                          {tfs.fixedInBuild
                            ? <span className="text-green-300 font-medium">{tfs.fixedInBuild}</span>
                            : <span className="italic text-gray-600">Not yet deployed</span>}
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-500 shrink-0">Assigned:</span>
                          <span className="text-gray-300 truncate">{tfs.assignedTo}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-500 shrink-0">Area:</span>
                          <span className="text-gray-300 truncate">{shortenArea(tfs.areaPath)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-14 text-gray-500 text-sm">
            {cipWithTFS.length === 0
              ? "No CIP incidents have linked TFS items yet. Ensure CIP records contain TFS ticket numbers."
              : "No incidents match your search."}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TFSRecordsPage() {
  const [cipRecords, setCipRecords]       = useState<CIPRecord[]>([]);
  const [tfsItems, setTfsItems]           = useState<TFSWorkItem[]>([]);
  const [cipLoading, setCipLoading]       = useState(true);
  const [tfsLoading, setTfsLoading]       = useState(false);
  const [tfsError, setTfsError]           = useState<string | null>(null);
  const [errorCode, setErrorCode]         = useState<ErrorCode>(null);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [usedFallback, setUsedFallback]   = useState(false);
  const [fallbackReason, setFallbackReason] = useState("");
  const [capped, setCapped]               = useState(false);
  const [dateRange, setDateRange]         = useState<DateRangeMonths>(3);
  const [activeTab, setActiveTab]         = useState<"items" | "incidents">("items");

  // Filters (Work Items tab)
  const [search, setSearch]               = useState("");
  const [selectedType, setSelectedType]   = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedBuild, setSelectedBuild] = useState("All");
  const [cipLinkedOnly, setCipLinkedOnly] = useState(false);

  // Detail slide-out panel
  const [panelItem, setPanelItem]         = useState<TFSWorkItem | null>(null);

  const cipIdsRef = useRef<number[]>([]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const doFetch = useCallback(async (months: DateRangeMonths, cipIds: number[]) => {
    setTfsLoading(true);
    setTfsError(null);
    setErrorCode(null);
    setUsedFallback(false);
    setFallbackReason("");
    setCapped(false);

    try {
      const { items, usedFallback: fb, fallbackReason: fr, capped: cp } = await fetchAllTFSData(months, cipIds);
      setTfsItems(items);
      setUsedFallback(fb);
      setFallbackReason(fr);
      setCapped(cp);
      setLastUpdated(new Date());
    } catch (e) {
      const err = e as Error & { code?: string };
      const msg = err.message ?? "Unknown error";
      const code = err.code;

      if (code === "NO_PAT") {
        setErrorCode("NO_PAT"); setTfsError("NO_PAT");
      } else if (code === "INVALID_PAT") {
        setErrorCode("INVALID_PAT"); setTfsError("INVALID_PAT");
      } else if (code === "METHOD_NOT_ALLOWED") {
        setErrorCode("METHOD_NOT_ALLOWED"); setTfsError("METHOD_NOT_ALLOWED");
      } else if (
        msg.includes("Failed to fetch") || msg.includes("NetworkError") ||
        msg.includes("Load failed")     || msg.includes("fetch failed") || msg.includes("CORS")
      ) {
        const probeUrl = `${TFS_URL}/${TFS_COLLECTION}/${TFS_PROJECT}/_apis/`;
        let isCors = false;
        try { await fetch(probeUrl, { mode: "no-cors" }); isCors = true; } catch { isCors = false; }
        setErrorCode(isCors ? "CORS" : "NETWORK");
        setTfsError(isCors ? "CORS" : "NETWORK");
      } else {
        setErrorCode("OTHER"); setTfsError(msg);
      }
    } finally {
      setTfsLoading(false);
    }
  }, []);

  // Load CIP records on mount, then fetch TFS
  useEffect(() => {
    fetchCIPRecordsOnce().then(r => {
      setCipRecords(r);
      setCipLoading(false);
      const ids = extractCIPTFSIds(r);
      cipIdsRef.current = ids;
      doFetch(3, ids);
    });
  }, [doFetch]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const cipMap  = useMemo(() => buildCipMap(cipRecords), [cipRecords]);
  const tfsById = useMemo(() => {
    const m: Record<number, TFSWorkItem> = {};
    for (const item of tfsItems) m[item.id] = item;
    return m;
  }, [tfsItems]);
  const tfsMap = useMemo(() => buildTfsMap(cipRecords, tfsById), [cipRecords, tfsById]);

  const allBuilds = useMemo(() => {
    const set = new Set<string>();
    for (const item of tfsItems) if (item.fixedInBuild) set.add(item.fixedInBuild);
    return ["All", ...[...set].sort()];
  }, [tfsItems]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tfsItems
      .filter(item => {
        if (q && !String(item.id).includes(q) && !item.title.toLowerCase().includes(q) &&
            !item.areaPath.toLowerCase().includes(q) && !item.tags.toLowerCase().includes(q)) return false;
        if (selectedType   !== "All" && item.type          !== selectedType)   return false;
        if (selectedStatus !== "All" && item.status        !== selectedStatus) return false;
        if (selectedBuild  !== "All" && item.fixedInBuild  !== selectedBuild)  return false;
        if (cipLinkedOnly  && !cipMap[item.id]?.length)                        return false;
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [tfsItems, search, selectedType, selectedStatus, selectedBuild, cipLinkedOnly, cipMap]);

  const kpi = useMemo(() => ({
    total:   tfsItems.length,
    closed:  tfsItems.filter(i => ["closed", "resolved"].includes(i.status.toLowerCase())).length,
    active:  tfsItems.filter(i => ["active", "in progress"].includes(i.status.toLowerCase())).length,
    bugs:    tfsItems.filter(i => i.type.toLowerCase() === "bug").length,
    stories: tfsItems.filter(i => i.type.toLowerCase() === "user story").length,
  }), [tfsItems]);

  const hasFilters = search || selectedType !== "All" || selectedStatus !== "All" || selectedBuild !== "All" || cipLinkedOnly;
  const loading    = cipLoading || tfsLoading;
  const hasPAT     = !!TFS_ENV_PAT;

  const handleDateRangeChange = (months: DateRangeMonths) => {
    setDateRange(months);
    doFetch(months, cipIdsRef.current);
  };

  const handleRefresh = async () => {
    await doFetch(dateRange, cipIdsRef.current);
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 2000);
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["TFS ID","Type","Title","Status","Found In Build","Fixed In Build","Iteration","Area","Assigned To","Linked Incidents","Client Names","Updated Date"],
      ...filtered.map(i => {
        const cips = cipMap[i.id] ?? [];
        return [
          i.id, i.type, i.title, i.status,
          i.foundInBuild || "", i.fixedInBuild || "",
          i.iteration, i.areaPath, i.assignedTo,
          cips.length,
          cips.map(c => c.clientName).filter(Boolean).join("; "),
          i.changedDate ? new Date(i.changedDate).toISOString().slice(0, 10) : "",
        ];
      }),
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `TFS_Records_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">TFS Records</h2>
          <p className="text-sm text-gray-500 mt-0.5">Azure DevOps — Omnia360Suite Project</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Show:</span>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {DATE_RANGE_OPTIONS.map(opt => (
                <button key={opt.months}
                  onClick={() => !loading && handleDateRangeChange(opt.months)}
                  disabled={loading}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-700 last:border-r-0 disabled:cursor-not-allowed ${
                    dateRange === opt.months
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {lastUpdated && (
            <span className={`text-xs transition-colors ${justRefreshed ? "text-green-400 font-medium" : "text-gray-500"}`}>
              {justRefreshed ? "Updated!" : `Synced ${formatTime(lastUpdated)}`}
            </span>
          )}
          <button onClick={handleRefresh} disabled={loading}
            className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={handleExportCSV} disabled={loading || filtered.length === 0}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors">
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 animate-pulse">
              <div className="h-3 w-24 bg-gray-700 rounded mb-3" /><div className="h-8 w-16 bg-gray-700 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Items</p>
              <p className="text-2xl font-bold text-indigo-400 tabular-nums">{kpi.total}</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Closed / Resolved</p>
              <p className="text-2xl font-bold text-green-400 tabular-nums">{kpi.closed}</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Active</p>
              <p className="text-2xl font-bold text-yellow-400 tabular-nums">{kpi.active}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Bugs / User Stories</p>
              <p className="text-2xl font-bold tabular-nums">
                <span className="text-red-400">{kpi.bugs}</span>
                <span className="text-base text-gray-500 font-normal mx-1">/</span>
                <span className="text-blue-400">{kpi.stories}</span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Status notices */}
      {usedFallback && !tfsError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-blue-900/20 border border-blue-700/40">
          <p className="text-xs text-blue-300 font-medium mb-1">
            Showing CIP-linked records only — Reporting API unavailable. Date range not applied.
          </p>
          {fallbackReason && (
            <p className="text-xs text-blue-500/80 font-mono break-all">{fallbackReason}</p>
          )}
        </div>
      )}
      {capped && !tfsError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40">
          <p className="text-xs text-amber-400">
            Showing first {MAX_REPORTING_ITEMS} work items. Select a shorter date range to see more specific results.
          </p>
        </div>
      )}

      {/* Error banners */}
      {errorCode === "CORS" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-orange-900/20 border border-orange-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🚫</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-orange-300">CORS Blocked — TFS Server Reached but Request Denied</p>
              <p className="text-xs text-orange-400/90 mt-1">
                Your browser can reach the TFS server (VPN is working), but the server is not returning CORS headers that allow requests from this app&apos;s origin.
              </p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Add these headers to the TFS site&apos;s web.config in IIS:</p>
              <pre className="text-xs bg-gray-900 text-green-400 rounded px-3 py-2 mt-1 overflow-x-auto whitespace-pre-wrap">{`Access-Control-Allow-Origin: https://my-next-app-seven-neon.vercel.app\nAccess-Control-Allow-Methods: GET, OPTIONS\nAccess-Control-Allow-Headers: Authorization, Content-Type, Accept`}</pre>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-orange-300 hover:text-orange-200 underline underline-offset-2 disabled:opacity-50">Retry</button>
            </div>
          </div>
        </div>
      )}
      {errorCode === "NETWORK" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-yellow-900/20 border border-yellow-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🌐</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-300">VPN Required — Cannot Reach TFS</p>
              <p className="text-xs text-yellow-500/90 mt-1">Your browser cannot reach the TFS server. Connect to the company VPN and try again.</p>
              <p className="text-xs text-gray-600 mt-1 font-mono">{TFS_URL}/{TFS_COLLECTION}/{TFS_PROJECT}/_apis/wit/</p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-yellow-300 hover:text-yellow-200 underline underline-offset-2 disabled:opacity-50">Retry after connecting to VPN</button>
            </div>
          </div>
        </div>
      )}
      {errorCode === "NO_PAT" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🔐</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">TFS Token Not Configured</p>
              <p className="text-xs text-red-400 mt-1">
                No PAT found. Add <code className="bg-red-900/30 px-1 rounded">NEXT_PUBLIC_TFS_PAT</code> to Vercel environment variables and redeploy, or use the override below.
              </p>
              <PATOverridePanel onSaved={() => doFetch(dateRange, cipIdsRef.current)} />
            </div>
          </div>
        </div>
      )}
      {errorCode === "INVALID_PAT" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">❌</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">TFS Authentication Failed</p>
              <p className="text-xs text-red-400 mt-1">The PAT is invalid or expired. Update <code className="bg-red-900/30 px-1 rounded">NEXT_PUBLIC_TFS_PAT</code> in Vercel, or enter a new PAT below.</p>
              {!hasPAT && <p className="text-xs text-gray-500 mt-1">PAT source: env variable not set — using override.</p>}
              <PATOverridePanel onSaved={() => doFetch(dateRange, cipIdsRef.current)} />
            </div>
          </div>
        </div>
      )}
      {errorCode === "METHOD_NOT_ALLOWED" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">⛔</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">Request Method Not Allowed (405)</p>
              <p className="text-xs text-red-400 mt-1">The TFS server rejected the request. Only GET requests are supported.</p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-gray-300 hover:text-white underline underline-offset-2 disabled:opacity-50">Retry</button>
            </div>
          </div>
        </div>
      )}
      {errorCode === "OTHER" && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">TFS Error</p>
              <p className="text-xs text-red-400 mt-1 font-mono break-all">{tfsError}</p>
              <button onClick={handleRefresh} disabled={loading}
                className="mt-2 text-xs text-gray-300 hover:text-white underline underline-offset-2 disabled:opacity-50">Retry</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!tfsError && (
        <>
          <div className="flex border-b border-gray-800 mb-5">
            {([["items", "Work Items"], ["incidents", "CIP Incidents"]] as const).map(([tab, label]) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}>
                {label}
                {tab === "items" && !loading && tfsItems.length > 0 && (
                  <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">{tfsItems.length}</span>
                )}
                {tab === "incidents" && !loading && (
                  <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                    {Object.keys(tfsMap).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Work Items Tab ──────────────────────────────────────────────── */}
          {activeTab === "items" && (
            <>
              {/* Version Summary */}
              {!loading && tfsItems.length > 0 && (
                <VersionSummary tfsItems={tfsItems} cipMap={cipMap} />
              )}

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                  </svg>
                  <input type="text" placeholder="Search TFS #, title, area…" value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                </div>
                <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                  className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
                  <option value="All">All Types</option>
                  <option value="Bug">Bug</option>
                  <option value="User Story">User Story</option>
                  <option value="Task">Task</option>
                  <option value="Test Case">Test Case</option>
                </select>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                  className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                  <option value="Resolved">Resolved</option>
                  <option value="New">New</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Code Complete">Code Complete</option>
                  <option value="Design">Design</option>
                </select>
                <select value={selectedBuild} onChange={e => setSelectedBuild(e.target.value)}
                  className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
                  {allBuilds.map(b => <option key={b} value={b} className="bg-gray-900">{b === "All" ? "All Builds" : b}</option>)}
                </select>
                <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setCipLinkedOnly(v => !v)}>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${cipLinkedOnly ? "bg-indigo-600" : "bg-gray-700"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${cipLinkedOnly ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                  <span className="text-sm text-gray-400">CIP Linked Only</span>
                </label>
                {hasFilters && (
                  <button onClick={() => { setSearch(""); setSelectedType("All"); setSelectedStatus("All"); setSelectedBuild("All"); setCipLinkedOnly(false); }}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-2 rounded-lg transition-colors">
                    Clear filters
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
                  <p className="text-sm font-medium text-white">
                    {loading ? "Loading…" : `${filtered.length} work item${filtered.length !== 1 ? "s" : ""}${hasFilters ? " (filtered)" : ""}`}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-3 text-left font-semibold">TFS ID</th>
                        <th className="px-4 py-3 text-left font-semibold">Type</th>
                        <th className="px-4 py-3 text-left font-semibold">Title</th>
                        <th className="px-4 py-3 text-left font-semibold">Status</th>
                        <th className="px-4 py-3 text-left font-semibold">Found In</th>
                        <th className="px-4 py-3 text-left font-semibold">Fixed In</th>
                        <th className="px-4 py-3 text-left font-semibold">Area</th>
                        <th className="px-4 py-3 text-left font-semibold">Incidents</th>
                        <th className="px-4 py-3 text-left font-semibold">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-16 text-center text-gray-500 text-sm">
                            {tfsItems.length === 0
                              ? "No TFS records found for this period. Ensure CIP records have TFS ticket numbers."
                              : "No items match your filters."}
                          </td>
                        </tr>
                      ) : (
                        filtered.map(item => {
                          const linkedCips = cipMap[item.id] ?? [];
                          return (
                            <tr key={item.id} onClick={() => setPanelItem(item)}
                              className="border-b border-gray-800/60 hover:bg-gray-800/30 cursor-pointer transition-colors">
                              <td className="px-4 py-3.5">
                                <a href={item.tfsUrl} target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-indigo-400 hover:text-indigo-300 font-mono font-medium hover:underline">
                                  #{item.id}
                                </a>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${typeBadgeClass(item.type)}`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 max-w-xs">
                                <span className="block truncate text-gray-200" title={item.title}>{item.title}</span>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(item.status)}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-gray-400 text-xs font-mono">
                                {item.foundInBuild || <span className="text-gray-700">—</span>}
                              </td>
                              <td className="px-4 py-3.5 text-xs font-mono">
                                {item.fixedInBuild
                                  ? <span className="text-green-400">{item.fixedInBuild}</span>
                                  : <span className="text-gray-700">—</span>}
                              </td>
                              <td className="px-4 py-3.5 text-gray-500 text-xs max-w-[160px]">
                                <span className="block truncate" title={item.areaPath}>{shortenArea(item.areaPath)}</span>
                              </td>
                              <td className="px-4 py-3.5">
                                {linkedCips.length > 0 ? (
                                  <span className="inline-flex items-center justify-center min-w-[24px] h-6 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-xs font-bold text-indigo-300 px-1.5">
                                    {linkedCips.length}
                                  </span>
                                ) : <span className="text-gray-700">—</span>}
                              </td>
                              <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">{timeAgo(item.changedDate)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── CIP Incidents Tab ───────────────────────────────────────────── */}
          {activeTab === "incidents" && (
            <CIPIncidentsPanel
              cipRecords={cipRecords}
              tfsMap={tfsMap}
              onOpenItem={setPanelItem}
            />
          )}
        </>
      )}

      {/* Detail slide-out panel */}
      {panelItem && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelItem(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-[#0f1623] border-l border-gray-800 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-[#0f1623]">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${typeBadgeClass(panelItem.type)}`}>
                  {panelItem.type}
                </span>
                <span className="font-mono text-indigo-400 font-medium">#{panelItem.id}</span>
              </div>
              <button onClick={() => setPanelItem(null)} className="text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white leading-snug">{panelItem.title}</h3>
                <a href={panelItem.tfsUrl} target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-400 hover:underline mt-1 inline-block">Open in TFS ↗</a>
              </div>

              {/* Version details — prominent */}
              <div className="bg-gray-800/40 border border-gray-700/60 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Version Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Found In Build</p>
                    <p className="text-sm font-medium text-gray-200">
                      {panelItem.foundInBuild || <span className="text-gray-600 italic text-xs">Build not specified</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Fixed In Build</p>
                    <p className="text-sm font-medium">
                      {panelItem.fixedInBuild
                        ? <span className="text-green-300">{panelItem.fixedInBuild}</span>
                        : <span className="text-gray-600 italic text-xs">Not yet deployed to a build</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Iteration</p>
                    <p className="text-sm text-gray-300">{panelItem.iteration || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Area</p>
                    <p className="text-sm text-gray-300 break-words">{panelItem.areaPath || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Status & assignment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full border ${statusBadgeClass(panelItem.status)}`}>
                    {panelItem.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Assigned To</p>
                  <p className="text-sm text-gray-300">{panelItem.assignedTo}</p>
                </div>
                {panelItem.createdDate && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Created</p>
                    <p className="text-sm text-gray-300">{new Date(panelItem.createdDate).toLocaleDateString()}</p>
                  </div>
                )}
                {panelItem.changedDate && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Last Updated</p>
                    <p className="text-sm text-gray-300">{timeAgo(panelItem.changedDate)}</p>
                  </div>
                )}
              </div>

              {panelItem.tags && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {panelItem.tags.split(";").map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked CIP incidents */}
              {(cipMap[panelItem.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Linked CIP Incidents ({cipMap[panelItem.id].length})</p>
                  <div className="space-y-2">
                    {cipMap[panelItem.id].map(cip => (
                      <div key={cip.id} className="flex items-center justify-between bg-gray-800/40 border border-gray-700/50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm text-white font-medium">{cip.clientName || "—"}</p>
                          {cip.chrTicketNumbers && <p className="text-xs text-gray-500 font-mono">{cip.chrTicketNumbers}</p>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusBadgeClass(cip.cipStatus ?? "")}`}>
                          {cip.cipStatus || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
