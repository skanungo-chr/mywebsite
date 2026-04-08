import { NextResponse } from "next/server";
import { fetchCIPRecordsPage } from "@/lib/cip";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let nextLink: string | null = null;
  let listName: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    nextLink = body?.nextLink ?? null;
    listName = body?.listName ?? undefined;
  } catch { /* no body */ }

  try {
    const result = await fetchCIPRecordsPage(listName, userToken, nextLink);
    return NextResponse.json({ success: true, records: result.records, nextLink: result.nextLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
