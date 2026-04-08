import { NextResponse } from "next/server";
import { fetchCIPRecordsPage } from "@/lib/cip";
import { graphFetch } from "@/lib/msgraph";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let nextLink: string | null = null;
  let listName: string | undefined;
  let fromYear: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    nextLink  = body?.nextLink  ?? null;
    listName  = body?.listName  ?? undefined;
    fromYear  = body?.fromYear  ?? "2025";
  } catch { /* no body */ }

  try {
    const result = await fetchCIPRecordsPage(listName, userToken, nextLink, fromYear);
    return NextResponse.json({ success: true, records: result.records, nextLink: result.nextLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// GET: check raw Product field values from SharePoint
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const site = await graphFetch(`/sites/chrsolutionsinc649.sharepoint.com:/sites/CIPCenter:`, token) as { id: string };
    const listsData = await graphFetch(`/sites/${site.id}/lists`, token) as { value: { id: string; displayName: string }[] };
    const cipList = listsData.value.find((l) => l.displayName === "Change Implementation Plan");
    if (!cipList) return NextResponse.json({ error: "CIP list not found" }, { status: 404 });

    const items = await graphFetch(
      `/sites/${site.id}/lists/${cipList.id}/items?expand=fields(select=Product,Change_x0020_Name,Category,formStatus,CIPStatuss)&$filter=fields/ContentType ne 'Folder'&$top=10`,
      token
    ) as { value: { id: string; fields: Record<string, unknown> }[] };

    return NextResponse.json({
      sample: items.value.map((i) => ({
        id: i.id,
        Product: i.fields.Product,
        ClientName: i.fields.Change_x0020_Name,
        Category: i.fields.Category,
        CIPType: i.fields.formStatus,
        CIPStatus: i.fields.CIPStatuss,
      }))
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
