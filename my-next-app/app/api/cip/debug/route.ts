import { NextResponse } from "next/server";
import { graphFetch } from "@/lib/msgraph";

interface SharePointSite {
  id: string;
  displayName: string;
  webUrl: string;
}

interface SharePointList {
  id: string;
  displayName: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Sign in with Microsoft 365 first. This endpoint requires a delegated user token." },
      { status: 401 }
    );
  }

  const steps: Record<string, unknown> = {};

  try {
    let site: SharePointSite | undefined;

    // Attempt 1: standard colon-path format
    try {
      site = await graphFetch(
        `/sites/chrsolutionsinc649.sharepoint.com:/sites/CIPCenter:`,
        token
      ) as SharePointSite;
      steps.attempt1 = "OK";
    } catch (e1) {
      steps.attempt1 = e1 instanceof Error ? e1.message : String(e1);
    }

    // Attempt 2: slash format (no colons)
    if (!site?.id) {
      try {
        site = await graphFetch(
          `/sites/chrsolutionsinc649.sharepoint.com/sites/CIPCenter`,
          token
        ) as SharePointSite;
        steps.attempt2 = "OK";
      } catch (e2) {
        steps.attempt2 = e2 instanceof Error ? e2.message : String(e2);
      }
    }

    // Attempt 3: search by keyword
    if (!site?.id) {
      try {
        const search = await graphFetch(`/sites?search=CIPCenter`, token) as { value: SharePointSite[] };
        steps.attempt3_results = search.value?.map((s) => ({
          id: s.id,
          name: s.displayName,
          url: s.webUrl,
        }));
        site = search.value?.[0];
        if (site) steps.attempt3 = "OK";
      } catch (e3) {
        steps.attempt3 = e3 instanceof Error ? e3.message : String(e3);
      }
    }

    if (!site?.id) {
      return NextResponse.json({
        success: false,
        steps,
        error: "Could not access SharePoint site. Make sure Sites.Read.All delegated permission is consented.",
      }, { status: 403 });
    }

    steps.site = { id: site.id, name: site.displayName, url: site.webUrl };

    // List all lists on the site
    const lists = await graphFetch(`/sites/${site.id}/lists`, token) as { value: SharePointList[] };
    steps.lists = lists.value.map((l) => ({ name: l.displayName, id: l.id }));

    return NextResponse.json({ success: true, steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, steps, error: message }, { status: 500 });
  }
}
