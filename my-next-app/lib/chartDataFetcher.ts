import { CIPRecord } from "@/lib/cip";

export function groupBy(records: CIPRecord[], key: keyof CIPRecord): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    const val = String(r[key] ?? "").trim() || "(blank)";
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

export function topN(counts: Record<string, number>, n = 12) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({ name, value }));
}

export function monthlyTrend(records: CIPRecord[], months = 24) {
  const counts: Record<string, number> = {};
  for (const r of records) {
    if (!r.submissionDate) continue;
    const month = r.submissionDate.slice(0, 7);
    counts[month] = (counts[month] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, value]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      value,
    }));
}
