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

  // Collect config diagnostics (mask PAT)
  const cfgUrl        = process.env.AZURE_DEVOPS_URL        ?? "(not set)";
  const cfgCollection = process.env.AZURE_DEVOPS_COLLECTION ?? "(not set)";
  const cfgProject    = process.env.AZURE_DEVOPS_PROJECT    ?? "(not set)";
  const cfgApiVersion = process.env.AZURE_DEVOPS_API_VERSION ?? "2.0 (default)";
  const cfgPat        = process.env.AZURE_DEVOPS_PAT
    ? `set (${process.env.AZURE_DEVOPS_PAT.length} chars)`
    : "(not set)";

  const wiqlEndpoint = cfgUrl !== "(not set)" && cfgCollection !== "(not set)"
    ? `${cfgUrl.replace(/\/$/, "")}/${cfgCollection}/_apis/wit/wiql?api-version=${cfgApiVersion}`
    : "(cannot build — missing URL or collection)";

  const diagnostics = {
    url:        cfgUrl,
    collection: cfgCollection,
    project:    cfgProject,
    apiVersion: cfgApiVersion,
    pat:        cfgPat,
    endpoint:   wiqlEndpoint,
  };

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
    const errName = err instanceof Error ? err.name : "";

    const isECONNREFUSED = message.includes("ECONNREFUSED");
    const isENOTFOUND    = message.includes("ENOTFOUND");
    const isETIMEDOUT    = message.includes("ETIMEDOUT") || message.includes("aborted") || errName === "AbortError";
    const isECONNRESET   = message.includes("ECONNRESET");
    const isFetchFailed  = message.includes("fetch failed");

    const isNetwork = isECONNREFUSED || isENOTFOUND || isETIMEDOUT || isECONNRESET || isFetchFailed;

    let networkReason = "";
    if (isENOTFOUND)    networkReason = "DNS resolution failed — hostname not found";
    else if (isECONNREFUSED) networkReason = "Connection refused — server is not listening on that port";
    else if (isETIMEDOUT)    networkReason = "Connection timed out — server did not respond in time";
    else if (isECONNRESET)   networkReason = "Connection reset — server closed the connection unexpectedly";
    else if (isFetchFailed)  networkReason = "Fetch failed — network-level error reaching the server";

    const status = isNetwork                          ? 503
      : message.includes("401")                      ? 401
      : message.includes("403")                      ? 403
      : message.includes("not configured")           ? 500
      : 502;

    return NextResponse.json(
      { error: message, isNetwork, networkReason, diagnostics },
      { status }
    );
  }
}
