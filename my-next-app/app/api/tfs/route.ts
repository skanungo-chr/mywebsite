import { NextResponse } from "next/server";
import { fetchTFSByDateRange } from "@/lib/tfs";

export const runtime     = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let months = 3; // default: last 3 months
  try {
    const body = await req.json() as { months?: number };
    if (typeof body.months === "number") months = body.months;
  } catch {
    // no body — use default
  }

  try {
    const items = await fetchTFSByDateRange(months);

    const byType:   Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      byType[item.type]     = (byType[item.type]     ?? 0) + 1;
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    }

    return NextResponse.json(
      { items, total: items.length, byType, byStatus },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    const isNetwork =
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND")    ||
      message.includes("ETIMEDOUT")    ||
      message.includes("ECONNRESET")   ||
      message.includes("fetch failed") ||
      message.includes("aborted")      ||
      (err instanceof Error && err.name === "AbortError");

    const status = isNetwork                          ? 503
      : message.includes("401")                      ? 401
      : message.includes("403")                      ? 403
      : message.includes("not configured")           ? 500
      : 502;

    return NextResponse.json({ error: message, isNetwork }, { status });
  }
}
