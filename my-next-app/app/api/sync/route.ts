import { NextResponse } from "next/server";
import { syncCIPRecordsToFirestore } from "@/lib/sync";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const listName = searchParams.get("list") ?? undefined;

  const authHeader = request.headers.get("Authorization");
  const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const result = await syncCIPRecordsToFirestore(listName, userToken);
    const status = result.errors.length > 0 ? 207 : 200;
    return NextResponse.json({ success: true, ...result }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
