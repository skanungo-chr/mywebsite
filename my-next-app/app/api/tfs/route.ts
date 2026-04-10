import { NextResponse } from "next/server";
import { fetchTFSWorkItemsByIds } from "@/lib/tfs";

export const runtime    = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam?.trim()) {
    return NextResponse.json({ error: "ids parameter required" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  if (ids.length === 0) {
    return NextResponse.json({ items: [], total: 0, byType: {}, byStatus: {} });
  }

  try {
    const items = await fetchTFSWorkItemsByIds(ids);

    const byType:   Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      byType[item.type]     = (byType[item.type]     ?? 0) + 1;
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    }

    return NextResponse.json(
      { items, total: items.length, byType, byStatus },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Distinguish on-premise network errors from authentication/API errors
    const isNetwork =
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND")    ||
      message.includes("ETIMEDOUT")    ||
      message.includes("ECONNRESET")   ||
      message.includes("fetch failed") ||
      message.includes("aborted")      ||    // AbortController timeout
      (err instanceof Error && err.name === "AbortError");

    const status = isNetwork               ? 503
      : message.includes("401")            ? 401
      : message.includes("403")            ? 403
      : message.includes("404")            ? 404
      : message.includes("429")            ? 429
      : message.includes("not configured") ? 500
      : 502;

    return NextResponse.json({ error: message, isNetwork }, { status });
  }
}
