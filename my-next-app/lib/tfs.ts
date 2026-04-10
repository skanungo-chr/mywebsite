export interface TFSWorkItem {
  id:           number;
  title:        string;
  status:       string;
  type:         string;
  assignedTo:   string;
  foundInBuild: string;
  fixedInBuild: string;
  createdDate:  string | null;
  changedDate:  string | null;
  areaPath:     string;
  iteration:    string;
  tags:         string;
  tfsUrl:       string;
}

const TFS_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.AssignedTo",
  "System.WorkItemType",
  "System.CreatedDate",
  "System.ChangedDate",
  "Microsoft.VSTS.Build.FoundIn",
  "Microsoft.VSTS.Build.IntegrationBuild",
  "System.Tags",
  "System.AreaPath",
  "System.IterationPath",
].join(",");

function extractAssignedTo(val: unknown): string {
  if (!val) return "Unassigned";
  // TFS 2.0: string "Display Name <email>", newer: object { displayName }
  if (typeof val === "string") return val.replace(/<[^>]+>/, "").trim() || "Unassigned";
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    return String(o.displayName ?? o.uniqueName ?? "Unassigned").replace(/<[^>]+>/, "").trim();
  }
  return String(val).replace(/<[^>]+>/, "").trim();
}

export async function fetchTFSWorkItemsByIds(ids: number[]): Promise<TFSWorkItem[]> {
  if (ids.length === 0) return [];

  const pat        = process.env.AZURE_DEVOPS_PAT;
  const baseUrl    = (process.env.AZURE_DEVOPS_URL ?? "").replace(/\/$/, "");
  const collection = process.env.AZURE_DEVOPS_COLLECTION;
  const project    = process.env.AZURE_DEVOPS_PROJECT;
  const apiVersion = process.env.AZURE_DEVOPS_API_VERSION ?? "2.0";

  if (!pat || !baseUrl || !collection || !project) {
    throw new Error(
      "TFS not configured. Set AZURE_DEVOPS_PAT, AZURE_DEVOPS_URL, " +
      "AZURE_DEVOPS_COLLECTION, AZURE_DEVOPS_PROJECT in environment variables."
    );
  }

  const auth = Buffer.from(`:${pat}`).toString("base64");
  const results: TFSWorkItem[] = [];

  // TFS on-premise API supports max 200 IDs per batch
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const url =
      `${baseUrl}/${collection}/${project}/_apis/wit/workitems` +
      `?ids=${chunk.join(",")}` +
      `&fields=${TFS_FIELDS}` +
      `&api-version=${apiVersion}`;

    // 8-second timeout — keeps us inside Vercel's 10s function limit
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept:        "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`TFS API ${res.status}: ${errText}`);
    }

    const data = await res.json() as {
      value: Array<{ id: number; fields: Record<string, unknown> }>;
    };

    for (const item of data.value) {
      const f = item.fields;
      results.push({
        id:           item.id,
        title:        String(f["System.Title"]                          ?? ""),
        status:       String(f["System.State"]                          ?? ""),
        type:         String(f["System.WorkItemType"]                   ?? ""),
        assignedTo:   extractAssignedTo(f["System.AssignedTo"]),
        foundInBuild: String(f["Microsoft.VSTS.Build.FoundIn"]          ?? ""),
        fixedInBuild: String(f["Microsoft.VSTS.Build.IntegrationBuild"] ?? ""),
        createdDate:  f["System.CreatedDate"] ? String(f["System.CreatedDate"]) : null,
        changedDate:  f["System.ChangedDate"] ? String(f["System.ChangedDate"]) : null,
        areaPath:     String(f["System.AreaPath"]      ?? ""),
        iteration:    String(f["System.IterationPath"] ?? ""),
        tags:         String(f["System.Tags"]          ?? ""),
        tfsUrl:       `${baseUrl}/${collection}/${project}/_workitems/edit/${item.id}`,
      });
    }
  }

  return results;
}

/** Extract all TFS numeric IDs (4-6 digits) from CIP chrTicketNumbers fields. */
export function extractTFSIds(cipRecords: { chrTicketNumbers?: string }[]): number[] {
  const ids = new Set<number>();
  for (const cip of cipRecords) {
    const raw = String(cip.chrTicketNumbers ?? "");
    const matches = raw.match(/\d{4,6}/g);
    if (matches) for (const m of matches) ids.add(parseInt(m, 10));
  }
  return [...ids];
}
