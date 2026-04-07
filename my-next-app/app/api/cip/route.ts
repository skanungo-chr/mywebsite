import { NextResponse } from "next/server";
import { fetchCIPRecords } from "@/lib/cip";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listName = searchParams.get("list") ?? undefined;

  const authHeader = request.headers.get("Authorization");
  const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const records = await fetchCIPRecords(listName, userToken);
    const accessMode = userToken ? "delegated" : "app-only";
    return NextResponse.json({ success: true, accessMode, count: records.length, records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
