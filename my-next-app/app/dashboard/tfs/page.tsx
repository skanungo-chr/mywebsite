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

function cipStatusClass(s: string) {
  const l = s.toLowerCase();
  if (l === "approved" || l === "successful") return "bg-emerald-900/40 text-emerald-400 border-emerald-700/50";
  if (l === "denied")                         return "bg-red-900/40 text-red-400 border-red-700/50";
  return "bg-gray-800 text-gray-400 border-gray-700";
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

// ─── Tunnel Setup Guide ───────────────────────────────────────────────────────

function TunnelSetupGuide({ onDismiss }: { onDismiss: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const CodeBlock = ({ id, code }: { id: string; code: string }) => (
    <div className="relative group bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 mt-1.5">
      <code className="text-xs text-green-400 font-mono break-all">{code}</code>
      <button
        onClick={() => copy(code, id)}
        className="absolute right-2 top-2 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied === id ? (
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );

  return (
    <div className="bg-[#111827] border border-amber-700/40 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-gray-800 bg-amber-900/10">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <h3 className="text-sm font-bold text-amber-300">TFS server is not reachable from Vercel</h3>
            <p className="text-xs text-amber-600 mt-0.5">
              Your TFS server runs on HTTP (port 8080). Vercel is HTTPS. Browsers block HTTPS→HTTP requests — this cannot be fixed with CORS alone.
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-gray-400 shrink-0 ml-4 mt-0.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-6">

        {/* Option A — Cloudflare Tunnel (recommended) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold bg-green-900/40 text-green-400 border border-green-700/50 px-2 py-0.5 rounded-full">RECOMMENDED</span>
            <h4 className="text-sm font-semibold text-white">Option A — Cloudflare Tunnel (free, ~5 minutes)</h4>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Run this once on the <strong className="text-gray-300">devci01 server</strong> (or any PC on the same internal network). No firewall changes needed.
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 font-medium">1. Download cloudflared on the TFS machine (PowerShell as Admin):</p>
              <CodeBlock id="dl" code="winget install Cloudflare.cloudflared" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">2. Start the tunnel (no account needed for quick tunnels):</p>
              <CodeBlock id="tunnel" code="cloudflared tunnel --url http://localhost:8080" />
            </div>
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-3 text-xs text-gray-400">
              <p className="font-medium text-gray-300 mb-1">3. Copy the HTTPS URL it prints, e.g.:</p>
              <code className="text-indigo-300">https://abc-def-123.trycloudflare.com</code>
              <p className="mt-2">Then go to <strong className="text-gray-300">Vercel → Settings → Environment Variables</strong> and update:</p>
              <div className="mt-1.5 space-y-1">
                <div><code className="text-amber-300">AZURE_DEVOPS_URL</code> = <code className="text-green-300">https://abc-def-123.trycloudflare.com/tfs</code></div>
              </div>
              <p className="mt-2 text-gray-500">Then click <strong className="text-gray-400">Redeploy</strong> in Vercel, or run <code className="bg-gray-800 px-1 rounded">npx vercel --prod</code>.</p>
            </div>
            <p className="text-xs text-amber-600/80">
              Note: The free trycloudflare.com URL changes each restart. For a permanent URL, create a free Cloudflare account and use a named tunnel.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-800" />

        {/* Option B — Run app locally */}
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Option B — Run the app locally on your work PC</h4>
          <p className="text-xs text-gray-400 mb-3">
            When running locally, the Next.js server makes the TFS call directly (server-to-server, no CORS or HTTPS issues).
          </p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 font-medium">1. Clone &amp; install (one time):</p>
              <CodeBlock id="install" code="git clone https://github.com/skanungo-chr/mywebsite.git && cd mywebsite/my-next-app && npm install" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">2. Start the app:</p>
              <CodeBlock id="dev" code="npm run dev" />
            </div>
            <p className="text-xs text-gray-500">Open <code className="bg-gray-800 px-1 rounded text-indigo-300">http://localhost:3000/dashboard/tfs</code> — TFS data loads automatically using the PAT already in <code className="bg-gray-800 px-1 rounded">.env.local</code>.</p>
          </div>
        </div>

        <div className="border-t border-gray-800" />

        {/* Option C — IIS CORS */}
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Option C — Add SSL + CORS to TFS IIS (ask IT admin)</h4>
          <p className="text-xs text-gray-400 mb-2">
            Requires adding an SSL certificate to IIS so TFS is served over <code className="bg-gray-800 px-1 rounded">https://</code>, then adding CORS headers.
          </p>
          <p className="text-xs text-gray-500">IIS Manager → your TFS site → HTTP Response Headers → add:</p>
          <div className="bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 mt-1.5 text-xs font-mono text-green-400 space-y-1">
            <div>Access-Control-Allow-Origin: https://my-next-app-seven-neon.vercel.app</div>
            <div>Access-Control-Allow-Headers: Authorization, Content-Type, Accept</div>
            <div>Access-Control-Allow-Methods: GET, OPTIONS</div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TFSRecordsPage() {
  const [cipRecords, setCipRecords]           = useState<CIPRecord[]>([]);
  const [tfsItems, setTfsItems]               = useState<TFSWorkItem[]>([]);
  const [cipLoading, setCipLoading]           = useState(true);
  const [tfsLoading, setTfsLoading]           = useState(false);
  const [tfsError, setTfsError]               = useState<string | null>(null);
  const [errorType, setErrorType]             = useState<"auth"|"config"|"network"|"other"|null>(null);
  const [showGuide, setShowGuide]             = useState(false);
  const [lastUpdated, setLastUpdated]         = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed]     = useState(false);

  // Filters
  const [search, setSearch]                   = useState("");
  const [selectedType, setSelectedType]       = useState("All");
  const [selectedStatus, setSelectedStatus]   = useState("All");
  const [selectedBuild, setSelectedBuild]     = useState("All");
  const [cipLinkedOnly, setCipLinkedOnly]     = useState(false);

  // Detail panel
  const [panelItem, setPanelItem]             = useState<TFSWorkItem | null>(null);

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

  // ── Fetch TFS via server-side API route ───────────────────────────────────
  const fetchTFS = useCallback(async (cips: CIPRecord[]) => {
    const ids = extractTFSIds(cips);
    if (ids.length === 0) { setTfsLoading(false); return; }

    setTfsLoading(true);
    setTfsError(null);
    setErrorType(null);
    setShowGuide(false);

    try {
      const res = await fetch("/api/tfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      let data: Record<string, unknown> = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 504 || res.status === 502) {
          setTfsError("Gateway timeout — TFS did not respond in time.");
          setErrorType("network");
          setShowGuide(true);
          return;
        }
        setTfsError(`Unexpected response (${res.status}): ${text.slice(0, 200)}`);
        setErrorType("other");
        return;
      }

      if (!res.ok) {
        const msg = String(data.error ?? "Unknown error");
        if (res.status === 401 || res.status === 403) {
          setTfsError(msg); setErrorType("auth");
        } else if (res.status === 500 && msg.includes("not configured")) {
          setTfsError(msg); setErrorType("config");
        } else if (res.status === 503 || Boolean(data.isNetwork)) {
          setTfsError(msg); setErrorType("network"); setShowGuide(true);
        } else {
          setTfsError(msg); setErrorType("other");
        }
        return;
      }

      setTfsItems((data.items as TFSWorkItem[]) ?? []);
      setLastUpdated(new Date());
    } catch (e) {
      setTfsError(e instanceof Error ? e.message : "Failed to call /api/tfs");
      setErrorType("other");
    } finally {
      setTfsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cipLoading && cipRecords.length > 0) fetchTFS(cipRecords);
  }, [cipLoading, cipRecords, fetchTFS]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    await fetchTFS(cipRecords);
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

      {/* Error banner */}
      {tfsError && !showGuide && (
        <div className="mb-5 px-4 py-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              {errorType === "auth" ? (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS authentication failed</p>
                  <p className="text-xs text-red-400 mt-1">The PAT stored in <code className="bg-red-900/30 px-1 rounded">AZURE_DEVOPS_PAT</code> on Vercel is expired or invalid. Generate a new one in TFS → Security → Personal Access Tokens.</p>
                </>
              ) : errorType === "config" ? (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS environment variables missing</p>
                  <p className="text-xs text-red-400 mt-1">Add <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_PAT</code>, <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_URL</code>, <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_COLLECTION</code>, <code className="bg-red-900/30 px-1 rounded font-mono">AZURE_DEVOPS_PROJECT</code> to Vercel environment variables.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-red-300">TFS error</p>
                  <p className="text-xs text-red-400 mt-1 font-mono break-all">{tfsError}</p>
                </>
              )}
              <div className="flex items-center gap-3 mt-2">
                <button onClick={handleRefresh} disabled={loading}
                  className="text-xs text-red-300 hover:text-red-200 underline underline-offset-2 disabled:opacity-50">
                  Retry
                </button>
                <button onClick={() => setShowGuide(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
                  View setup guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tunnel setup guide */}
      {showGuide && (
        <div className="mb-6">
          <TunnelSetupGuide onDismiss={() => setShowGuide(false)} />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={handleRefresh} disabled={loading}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try again after setup
            </button>
            <button onClick={() => setShowGuide(false)} className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filters — only show when data loaded */}
      {!tfsError && !showGuide && (
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
              Reset
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!tfsError && !showGuide && (
        <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700">
                  {["TFS #","Type","Title","Status","Assigned To","Fixed In","Area","CIPs","Updated"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-600 text-sm">
                    {tfsItems.length === 0 ? "No TFS work items found." : "No items match the selected filters."}
                  </td></tr>
                ) : (
                  filtered.map((item, i) => {
                    const cipCount = cipMap[item.id]?.length ?? 0;
                    const isBug    = item.type.toLowerCase() === "bug";
                    return (
                      <tr key={item.id} className={`hover:bg-gray-800/40 transition-colors ${i % 2 === 1 ? "bg-[#1a1f2e]/20" : ""}`}>
                        <td className="px-4 py-3">
                          <a href={item.tfsUrl} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline whitespace-nowrap">
                            #{item.id}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isBug ? "bg-red-500" : "bg-blue-400"}`} />
                            <span className="text-xs text-gray-400">{item.type || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="text-xs text-gray-200 line-clamp-2 leading-relaxed" title={item.title}>{item.title || "—"}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.status ? (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadgeClass(item.status)}`}>{item.status}</span>
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[130px] truncate" title={item.assignedTo}>{item.assignedTo}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">{item.fixedInBuild || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate" title={item.areaPath}>{shortenArea(item.areaPath) || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {cipCount > 0 ? (
                            <button onClick={() => setPanelItem(item)}
                              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/60 border border-indigo-700/50 px-2 py-0.5 rounded-full transition-colors">
                              {cipCount}
                            </button>
                          ) : <span className="text-xs text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{timeAgo(item.changedDate)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Showing <span className="text-gray-300 font-medium">{filtered.length}</span> of{" "}
                <span className="text-gray-300 font-medium">{tfsItems.length}</span> items
              </span>
              <span className="text-xs text-gray-600">
                {extractTFSIds(cipRecords).length} unique TFS IDs across {cipRecords.length} CIP records
              </span>
            </div>
          )}
        </div>
      )}

      {/* Detail Panel */}
      {panelItem && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setPanelItem(null)}>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" />
          <div className="w-full max-w-md bg-[#111827] border-l border-gray-700 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/60 shrink-0">
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-indigo-400 font-semibold">TFS #{panelItem.id}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadgeClass(panelItem.status)}`}>{panelItem.status}</span>
                </div>
                <h3 className="text-sm font-semibold text-white leading-snug line-clamp-3">{panelItem.title}</h3>
              </div>
              <button onClick={() => setPanelItem(null)} className="text-gray-500 hover:text-white shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div><p className="text-gray-500 mb-0.5">Type</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${panelItem.type.toLowerCase()==="bug"?"bg-red-500":"bg-blue-400"}`} />
                      <span className="text-gray-200">{panelItem.type||"—"}</span>
                    </div>
                  </div>
                  <div><p className="text-gray-500 mb-0.5">Assigned To</p><p className="text-gray-200 truncate">{panelItem.assignedTo}</p></div>
                  <div><p className="text-gray-500 mb-0.5">Found In</p><p className="text-gray-200 font-mono">{panelItem.foundInBuild||"—"}</p></div>
                  <div><p className="text-gray-500 mb-0.5">Fixed In</p><p className="text-gray-200 font-mono">{panelItem.fixedInBuild||"—"}</p></div>
                  <div className="col-span-2"><p className="text-gray-500 mb-0.5">Area Path</p><p className="text-gray-400 font-mono text-[10px] break-all">{panelItem.areaPath||"—"}</p></div>
                  <div className="col-span-2"><p className="text-gray-500 mb-0.5">Iteration</p><p className="text-gray-400 font-mono text-[10px] break-all">{panelItem.iteration||"—"}</p></div>
                  {panelItem.tags && (
                    <div className="col-span-2"><p className="text-gray-500 mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {panelItem.tags.split(";").map((t)=>t.trim()).filter(Boolean).map((tag)=>(
                          <span key={tag} className="text-[10px] bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="col-span-2"><p className="text-gray-500 mb-0.5">Last Updated</p>
                    <p className="text-gray-400">{panelItem.changedDate ? new Date(panelItem.changedDate).toLocaleString() : "—"}</p>
                  </div>
                </div>
                <a href={panelItem.tfsUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700/40 hover:border-indigo-600 px-3 py-2 rounded-lg transition-colors w-fit">
                  Open in TFS
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Linked CIP Records <span className="ml-2 text-indigo-400 font-bold">{cipMap[panelItem.id]?.length ?? 0}</span>
                </p>
                {!cipMap[panelItem.id]?.length ? (
                  <p className="text-xs text-gray-600 italic">No CIP records reference this TFS item.</p>
                ) : (
                  <div className="space-y-2">
                    {cipMap[panelItem.id].map((cip) => (
                      <div key={cip.id} className="bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2.5 hover:border-gray-700 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-indigo-300 font-semibold truncate">{cip.chrTicketNumbers||"—"}</p>
                            <p className="text-xs text-gray-300 mt-0.5 truncate">{cip.clientName||"—"}</p>
                            <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-2">
                              <span>{cip.submissionDate?.slice(0,10)??""}</span>
                              {cip.emergencyFlag && <span className="text-red-400 font-semibold">EMERGENCY</span>}
                            </p>
                          </div>
                          {cip.cipStatus && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cipStatusClass(cip.cipStatus)}`}>{cip.cipStatus}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
