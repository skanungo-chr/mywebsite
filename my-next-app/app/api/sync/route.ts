import { NextResponse } from "next/server";
import { syncCIPRecordsToFirestore } from "@/lib/sync";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const listName = searchParams.get("list") ?? undefined;

  const authHeader = request.headers.get("Authorization");
  const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let nextLink: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    nextLink = body?.nextLink ?? null;
  } catch { /* no body */ }

  try {
    const result = await syncCIPRecordsToFirestore(listName, userToken, nextLink);
    const status = result.errors.length > 0 ? 207 : 200;
    return NextResponse.json({ success: true, ...result }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
