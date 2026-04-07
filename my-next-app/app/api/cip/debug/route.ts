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

interface SharePointColumn {
  name: string;
  displayName: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const steps: Record<string, unknown> = {
    accessMode: token ? "delegated" : "app-only",
  };

  try {
    // Step 1: Get site
    const site = await graphFetch(
      `/sites/chrsolutionsinc649.sharepoint.com:/sites/CIPCenter:`,
      token
    ) as SharePointSite;
    steps.site = { id: site.id, name: site.displayName, url: site.webUrl };

    // Step 2: Get all lists
    const listsData = await graphFetch(`/sites/${site.id}/lists`, token) as { value: SharePointList[] };
    const userLists = listsData.value.filter(
      (l) => !l.displayName.startsWith("_") && !l.displayName.startsWith("appdata")
    );
    steps.availableLists = userLists.map((l) => l.displayName);

    // Step 3: Find the CIP list
    const listNameEnv = process.env.SHAREPOINT_LIST_NAME ?? "Change Implementation Plan";
    const cipList = userLists.find(
      (l) => l.displayName.toLowerCase() === listNameEnv.toLowerCase()
    ) ?? userLists.find(
      (l) => ["cip", "cip records", "ciprecords", "change implementation plan", "change implementation plans", "cip list", "cips"]
        .includes(l.displayName.toLowerCase())
    );

    if (!cipList) {
      steps.error = `CIP list not found. Looked for "${listNameEnv}". Available: ${userLists.map((l) => l.displayName).join(", ")}`;
      return NextResponse.json({ success: false, steps });
    }

    steps.cipList = { name: cipList.displayName, id: cipList.id };

    // Step 4: Get columns (internal field names)
    const columnsData = await graphFetch(
      `/sites/${site.id}/lists/${cipList.id}/columns`,
      token
    ) as { value: SharePointColumn[] };
    steps.columns = columnsData.value
      .filter((c) => !c.name.startsWith("_") && !["Edit", "LinkTitle", "LinkTitleNoMenu", "DocIcon", "ItemChildCount", "FolderChildCount", "AppAuthor", "AppEditor"].includes(c.name))
      .map((c) => ({ internalName: c.name, displayName: c.displayName }));

    // Step 5: Fetch first item to see raw field values
    const itemsData = await graphFetch(
      `/sites/${site.id}/lists/${cipList.id}/items?expand=fields&$top=1`,
      token
    ) as { value: { id: string; fields: Record<string, unknown> }[] };

    if (itemsData.value.length > 0) {
      steps.sampleItemFields = itemsData.value[0].fields;
    } else {
      steps.sampleItemFields = "No items in list";
    }

    // Step 6: Show current field mapping
    steps.currentMapping = {
      "Title → chrTicketNumbers": "Title (CHR Ticket Numbers)",
      "CIPType → cipType": "CIPType",
      "CIPStatus → cipStatus": "CIPStatus",
      "SubmissionDate → submissionDate": "SubmissionDate",
    };

    return NextResponse.json({ success: true, steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, steps, error: message }, { status: 500 });
  }
}
