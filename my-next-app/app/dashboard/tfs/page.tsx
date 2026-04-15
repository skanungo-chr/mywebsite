"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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

interface TFSConfig {
  baseUrl:    string;   // e.g. https://ado.chrsolutions.com/tfs
  collection: string;   // e.g. DefaultCollection
  project:    string;   // e.g. Omnia360Suite
  pat:        string;
  apiVersion: string;   // e.g. 2.0
}

const CONFIG_KEY = "tfs_config_v1";
const TFS_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.AssignedTo",
  "System.CreatedDate",
  "System.ChangedDate",
  "System.AreaPath",
  "System.IterationPath",
  "System.Tags",
  "Microsoft.VSTS.Build.FoundIn",
  "Microsoft.VSTS.Build.IntegrationBuild",
].join(",");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "Just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}yr ago`;
}

function statusBadgeClass(s: string) {
  const l = s.toLowerCase();
  if (l === "active")                     return "bg-yellow-900/40 text-yellow-300 border-yellow-700/50";
  if (l === "closed" || l === "resolved") return "bg-green-900/40 text-green-300 border-green-700/50";
  if (l === "new")                        return "bg-gray-700/60 text-gray-300 border-gray-600/50";
  if (l === "in progress")                return "bg-cyan-900/40 text-cyan-300 border-cyan-700/50";
  if (l === "code complete")              return "bg-blue-900/40 text-blue-300 border-blue-700/50";
  return "bg-gray-800/60 text-gray-400 border-gray-600/50";
}

function shortenArea(area: string) {
  const p = area.split("\\");
  return p.length > 2 ? `…\\${p.slice(-2).join("\\")}` : area;
}

function extractTFSIds(cips: CIPRecord[]): number[] {
  const ids = new Set<number>();
  for (const cip of cips) {
    const raw = String(cip.chrTicketNumbers ?? "");
    const matches = raw.match(/\d{4,6}/g);
    if (matches) for (const m of matches) ids.add(parseInt(m, 10));
  }
  return [...ids];
}

function extractAssignedTo(raw: unknown): string {
  if (!raw) return "Unassigned";
  if (typeof raw === "string") {
    const m = raw.match(/^([^<]+)/);
    return m ? m[1].trim() : raw;
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return String(obj.displayName ?? obj.uniqueName ?? "Unassigned");
  }
  return "Unassigned";
}

// ─── Client-side TFS fetch ────────────────────────────────────────────────────

async function fetchTFSItemsClient(
  ids: number[],
  config: TFSConfig
): Promise<TFSWorkItem[]> {
  const { baseUrl, collection, project, pat, apiVersion } = config;
  const basicAuth = btoa(`:${pat}`);
  const batchSize = 200;
  const all: TFSWorkItem[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const url = `${baseUrl.replace(/\/$/, "")}/${collection}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${TFS_FIELDS}&api-version=${apiVersion}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error("Authentication failed — check your PAT."), { code: "auth" });
    }
    if (!res.ok) {
      throw new Error(`TFS responded ${res.status}: ${res.statusText}`);
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`Unexpected response (not JSON): ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { value?: unknown[] };
    const items = (data.value ?? []) as Record<string, unknown>[];

    for (const item of items) {
      const f = (item.fields ?? {}) as Record<string, unknown>;
      const id = Number(item.id);
      all.push({
        id,
        title:        String(f["System.Title"] ?? ""),
        status:       String(f["System.State"] ?? ""),
        type:         String(f["System.WorkItemType"] ?? ""),
        assignedTo:   extractAssignedTo(f["System.AssignedTo"]),
        foundInBuild: String(f["Microsoft.VSTS.Build.FoundIn"] ?? ""),
        fixedInBuild: String(f["Microsoft.VSTS.Build.IntegrationBuild"] ?? ""),
        createdDate:  f["System.CreatedDate"] ? String(f["System.CreatedDate"]) : null,
        changedDate:  f["System.ChangedDate"] ? String(f["System.ChangedDate"]) : null,
        areaPath:     String(f["System.AreaPath"] ?? ""),
        iteration:    String(f["System.IterationPath"] ?? ""),
        tags:         String(f["System.Tags"] ?? ""),
        tfsUrl:       `${baseUrl.replace(/\/$/, "")}/${collection}/${project}/_workitems/edit/${id}`,
      });
    }
  }

  return all;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800/60 animate-pulse">
      {[14, 20, 48, 20, 28, 16, 32, 8, 16].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 bg-gray-700 rounded" style={{ width: `${w * 4}px` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({
  initial,
  onSave,
  onCancel,
  showCancel,
}: {
  initial: Partial<TFSConfig>;
  onSave: (c: TFSConfig) => void;
  onCancel?: () => void;
  showCancel: boolean;
}) {
  const [form, setForm] = useState<TFSConfig>({
    baseUrl:    initial.baseUrl    ?? "https://ado.chrsolutions.com/tfs",
    collection: initial.collection ?? "CHR",
    project:    initial.project    ?? "Omnia360Suite",
    pat:        initial.pat        ?? "",
    apiVersion: initial.apiVersion ?? "2.0",
  });
  const [showPat, setShowPat] = useState(false);

  const set = (k: keyof TFSConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.baseUrl.trim() && form.collection.trim() && form.pat.trim();

  return (
    <div className="bg-[#111827] border border-gray-700 rounded-2xl overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Connect to TFS</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Your browser will fetch TFS data directly. Credentials are stored locally in this browser only.
          </p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">TFS Base URL</label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={set("baseUrl")}
              placeholder="https://ado.chrsolutions.com/tfs"
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600 font-mono"
            />
            <p className="text-xs text-gray-600 mt-1">Include /tfs at the end if your TFS uses that path.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Collection</label>
            <input
              type="text"
              value={form.collection}
              onChange={set("collection")}
              placeholder="DefaultCollection"
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Project</label>
            <input
              type="text"
              value={form.project}
              onChange={set("project")}
              placeholder="Omnia360Suite"
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Personal Access Token (PAT)</label>
            <div className="relative">
              <input
                type={showPat ? "text" : "password"}
                value={form.pat}
                onChange={set("pat")}
                placeholder="Paste your PAT here"
                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 pr-10 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPat((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPat ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              TFS → User Settings → Security → Personal Access Tokens. Requires "Work Items (Read)" scope.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">API Version</label>
            <input
              type="text"
              value={form.apiVersion}
              onChange={set("apiVersion")}
              placeholder="2.0"
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={() => valid && onSave(form)}
            disabled={!valid}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Connect &amp; Load
          </button>
          {showCancel && onCancel && (
            <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Cancel
            </button>
          )}
        </div>
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
  const [errorCode, setErrorCode]         = useState<"auth"|"network"|"other"|null>(null);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);

  // Config
  const [config, setConfig]           = useState<TFSConfig | null>(null);
  const [showConfig, setShowConfig]   = useState(false);

  // Filters
  const [search, setSearch]                 = useState("");
  const [selectedType, setSelectedType]     = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedBuild, setSelectedBuild]   = useState("All");
  const [cipLinkedOnly, setCipLinkedOnly]   = useState(false);

  // Detail panel
  const [panelItem, setPanelItem] = useState<TFSWorkItem | null>(null);

  // ── Load saved config from localStorage ──────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) setConfig(JSON.parse(saved) as TFSConfig);
    } catch { /* ignore */ }
  }, []);

  // ── Load CIP records ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchCIPRecordsOnce().then((r) => { setCipRecords(r); setCipLoading(false); });
  }, []);

  // ── CIP → TFS cross-reference map ─────────────────────────────────────────
  const cipMap = useMemo(() => {
    const map: Record<number, CIPRecord[]> = {};
    for (const cip of cipRecords) {
      const raw = String(cip.chrTicketNumbers ?? "");
      const matches = raw.match(/\d{4,6}/g);
      if (matches) for (const m of matches) {
        const id = parseInt(m, 10);
        if (!map[id]) map[id] = [];
        map[id].push(cip);
      }
    }
    return map;
  }, [cipRecords]);

  // ── Client-side TFS fetch ─────────────────────────────────────────────────
  const fetchTFS = useCallback(async (cips: CIPRecord[], cfg: TFSConfig) => {
    const ids = extractTFSIds(cips);
    if (ids.length === 0) { setTfsLoading(false); return; }

    setTfsLoading(true);
    setTfsError(null);
    setErrorCode(null);

    try {
      const items = await fetchTFSItemsClient(ids, cfg);
      setTfsItems(items);
      setLastUpdated(new Date());
    } catch (e) {
      const err = e as Error & { code?: string };
      const msg = err.message ?? "Unknown error";

      if (err.code === "auth") {
        setErrorCode("auth");
        setTfsError("Authentication failed — your PAT may be expired or invalid.");
      } else if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("CORS") ||
        msg.includes("Load failed")
      ) {
        setErrorCode("network");
        setTfsError(
          "Cannot reach the TFS server from your browser. " +
          "This usually means you are not on the internal network/VPN, " +
          "or the TFS server is blocking cross-origin requests (CORS)."
        );
      } else {
        setErrorCode("other");
        setTfsError(msg);
      }
    } finally {
      setTfsLoading(false);
    }
  }, []);

  // Auto-fetch when CIP records + config are ready
  useEffect(() => {
    if (!cipLoading && cipRecords.length > 0 && config) {
      fetchTFS(cipRecords, config);
    }
  }, [cipLoading, cipRecords, config, fetchTFS]);

  // ── Save config ───────────────────────────────────────────────────────────
  const handleSaveConfig = (cfg: TFSConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    setConfig(cfg);
    setShowConfig(false);
    setTfsItems([]);
    setTfsError(null);
    setErrorCode(null);
  };

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!config) return;
    await fetchTFS(cipRecords, config);
    if (!tfsError) {
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 2000);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const allBuilds = useMemo(() => {
    const set = new Set<string>();
    for (const item of tfsItems) if (item.fixedInBuild) set.add(item.fixedInBuild);
    return ["All", ...[...set].sort()];
  }, [tfsItems]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tfsItems
      .filter((item) => {
        if (q && !String(item.id).includes(q) && !item.title.toLowerCase().includes(q) &&
            !item.areaPath.toLowerCase().includes(q) && !item.tags.toLowerCase().includes(q)) return false;
        if (selectedType   !== "All" && item.type   !== selectedType)   return false;
        if (selectedStatus !== "All" && item.status !== selectedStatus) return false;
        if (selectedBuild  !== "All" && item.fixedInBuild !== selectedBuild) return false;
        if (cipLinkedOnly && !cipMap[item.id]?.length) return false;
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [tfsItems, search, selectedType, selectedStatus, selectedBuild, cipLinkedOnly, cipMap]);

  const kpi = useMemo(() => ({
    total:   tfsItems.length,
    closed:  tfsItems.filter((i) => ["closed","resolved"].includes(i.status.toLowerCase())).length,
    active:  tfsItems.filter((i) => ["active","in progress"].includes(i.status.toLowerCase())).length,
    bugs:    tfsItems.filter((i) => i.type.toLowerCase() === "bug").length,
    stories: tfsItems.filter((i) => i.type.toLowerCase() === "user story").length,
  }), [tfsItems]);

  const hasFilters = search || selectedType !== "All" || selectedStatus !== "All" || selectedBuild !== "All" || cipLinkedOnly;

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["TFS ID","Type","Title","Status","Assigned To","Fixed In Build","CIP Count","Last Updated"],
      ...filtered.map((i) => [
        i.id, i.type, i.title, i.status, i.assignedTo, i.fixedInBuild,
        cipMap[i.id]?.length ?? 0,
        i.changedDate ? new Date(i.changedDate).toISOString().slice(0, 10) : "",
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `TFS_Records_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const loading = cipLoading || tfsLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">TFS Records</h2>
          <p className="text-sm text-gray-500 mt-0.5">Azure DevOps — Omnia360Suite Project</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className={`text-xs transition-colors ${justRefreshed ? "text-green-400 font-medium" : "text-gray-500"}`}>
              {justRefreshed ? "Updated!" : `Synced at ${formatTime(lastUpdated)}`}
            </span>
          )}
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {config ? "Settings" : "Connect"}
          </button>
          {config && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Config Panel */}
      {(!config || showConfig) && (
        <ConfigPanel
          initial={config ?? {}}
          onSave={handleSaveConfig}
          onCancel={config ? () => setShowConfig(false) : undefined}
          showCancel={!!config}
        />
      )}

      {/* KPI Cards */}
      {config && !showConfig && (
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
      )}

      {/* Error banner */}
      {tfsError && config && !showConfig && (
        <div className={`mb-5 px-4 py-4 rounded-xl border ${
          errorCode === "network"
            ? "bg-amber-900/15 border-amber-700/40"
            : "bg-red-900/20 border-red-700/40"
        }`}>
          <div className="flex items-start gap-3">
            <svg className={`w-5 h-5 shrink-0 mt-0.5 ${errorCode === "network" ? "text-amber-400" : "text-red-400"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              {errorCode === "auth" ? (
                <>
                  <p className="text-sm font-semibold text-red-300">Authentication failed</p>
                  <p className="text-xs text-red-400 mt-1">Your PAT is expired or invalid. Generate a new one in TFS → User Settings → Security → Personal Access Tokens.</p>
                </>
              ) : errorCode === "network" ? (
                <>
                  <p className="text-sm font-semibold text-amber-300">Cannot reach TFS from your browser</p>
                  <p className="text-xs text-amber-500/90 mt-1">
                    Make sure you are on the internal network or VPN, and that TFS allows cross-origin requests (CORS).<br />
                    If TFS is HTTP and this app is HTTPS, browsers will block the request — open the app over HTTP locally or configure TFS with HTTPS.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS error</p>
                  <p className="text-xs text-red-400 mt-1 font-mono break-all">{tfsError}</p>
                </>
              )}
              <div className="flex items-center gap-3 mt-2">
                <button onClick={handleRefresh} disabled={loading}
                  className="text-xs text-gray-300 hover:text-white underline underline-offset-2 disabled:opacity-50">
                  Retry
                </button>
                <button onClick={() => setShowConfig(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                  Edit connection settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {config && !showConfig && !tfsError && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input type="text" placeholder="Search TFS #, title, area…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
          </div>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            <option value="All">All Types</option>
            <option value="Bug">Bug</option>
            <option value="User Story">User Story</option>
          </select>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
            <option value="Resolved">Resolved</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="Code Complete">Code Complete</option>
          </select>
          <select value={selectedBuild} onChange={(e) => setSelectedBuild(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
            {allBuilds.map((b) => <option key={b} value={b} className="bg-gray-900">{b === "All" ? "All Builds" : b}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setCipLinkedOnly((v) => !v)}>
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
      )}

      {/* Table */}
      {config && !showConfig && (
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
                  <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                  <th className="px-4 py-3 text-left font-semibold">Fixed In</th>
                  <th className="px-4 py-3 text-left font-semibold">Area</th>
                  <th className="px-4 py-3 text-left font-semibold">CIPs</th>
                  <th className="px-4 py-3 text-left font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-gray-500 text-sm">
                      {tfsItems.length === 0 ? "No TFS records loaded." : "No items match your filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const linkedCips = cipMap[item.id] ?? [];
                    return (
                      <tr key={item.id}
                        onClick={() => setPanelItem(item)}
                        className="border-b border-gray-800/60 hover:bg-gray-800/30 cursor-pointer transition-colors">
                        <td className="px-4 py-3.5">
                          <a href={item.tfsUrl} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-400 hover:text-indigo-300 font-mono font-medium hover:underline">
                            #{item.id}
                          </a>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                            item.type.toLowerCase() === "bug"
                              ? "bg-red-900/30 text-red-300 border-red-700/50"
                              : "bg-blue-900/30 text-blue-300 border-blue-700/50"
                          }`}>{item.type}</span>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <span className="block truncate text-gray-200" title={item.title}>{item.title}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap">{item.assignedTo}</td>
                        <td className="px-4 py-3.5 text-gray-400 font-mono text-xs">{item.fixedInBuild || "—"}</td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs max-w-[160px]">
                          <span className="block truncate" title={item.areaPath}>{shortenArea(item.areaPath)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          {linkedCips.length > 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">
                              {linkedCips.length}
                            </span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
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
      )}

      {/* Detail slide-out panel */}
      {panelItem && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelItem(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-[#0f1623] border-l border-gray-800 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-[#0f1623]">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                  panelItem.type.toLowerCase() === "bug"
                    ? "bg-red-900/30 text-red-300 border-red-700/50"
                    : "bg-blue-900/30 text-blue-300 border-blue-700/50"
                }`}>{panelItem.type}</span>
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
                  className="text-xs text-indigo-400 hover:underline mt-1 inline-block">
                  Open in TFS ↗
                </a>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {([
                  ["Status",     <span key="s" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(panelItem.status)}`}>{panelItem.status}</span>],
                  ["Assigned To", panelItem.assignedTo],
                  ["Found In",   panelItem.foundInBuild || "—"],
                  ["Fixed In",   panelItem.fixedInBuild || "—"],
                  ["Created",    panelItem.createdDate ? new Date(panelItem.createdDate).toLocaleDateString() : "—"],
                  ["Updated",    panelItem.changedDate  ? new Date(panelItem.changedDate).toLocaleDateString()  : "—"],
                ] as [string, React.ReactNode][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm text-gray-200">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-0.5">Area Path</p>
                <p className="text-sm text-gray-300 font-mono break-all">{panelItem.areaPath}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Iteration</p>
                <p className="text-sm text-gray-300 font-mono break-all">{panelItem.iteration}</p>
              </div>
              {panelItem.tags && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {panelItem.tags.split(";").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="text-xs bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full text-gray-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {cipMap[panelItem.id]?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Linked CIP Records ({cipMap[panelItem.id].length})</p>
                  <div className="space-y-2">
                    {cipMap[panelItem.id].map((cip) => (
                      <div key={cip.id} className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-200 font-medium truncate">{cip.chrTicketNumbers}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                            (cip.cipStatus ?? "").toLowerCase() === "approved" || (cip.cipStatus ?? "").toLowerCase() === "successful"
                              ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/50"
                              : (cip.cipStatus ?? "").toLowerCase() === "denied"
                              ? "bg-red-900/40 text-red-400 border-red-700/50"
                              : "bg-gray-800 text-gray-400 border-gray-700"
                          }`}>
                            {cip.cipStatus ?? "—"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{cip.clientName ?? ""}</p>
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
