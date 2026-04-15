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
  if (typeof val === "string") return val.replace(/<[^>]+>/, "").trim() || "Unassigned";
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    return String(o.displayName ?? o.uniqueName ?? "Unassigned").replace(/<[^>]+>/, "").trim();
  }
  return String(val).replace(/<[^>]+>/, "").trim();
}

function getConfig() {
  const pat        = process.env.AZURE_DEVOPS_PAT;
  const baseUrl    = (process.env.AZURE_DEVOPS_URL        ?? "").trim().replace(/\/+$/, "");
  const collection = (process.env.AZURE_DEVOPS_COLLECTION ?? "").trim();
  const project    = (process.env.AZURE_DEVOPS_PROJECT    ?? "").trim();
  const apiVersion = (process.env.AZURE_DEVOPS_API_VERSION ?? "2.0").trim();

  if (!pat || !baseUrl || !collection || !project) {
    throw new Error(
      "TFS not configured. Set AZURE_DEVOPS_PAT, AZURE_DEVOPS_URL, " +
      "AZURE_DEVOPS_COLLECTION, AZURE_DEVOPS_PROJECT in environment variables."
    );
  }

  return { pat, baseUrl, collection, project, apiVersion };
}

async function tfsGet(url: string, auth: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    return res;
  } catch (err) {
    const cause = (err as { cause?: { message?: string; code?: string } })?.cause;
    if (cause) {
      const detail = [cause.code, cause.message].filter(Boolean).join(": ");
      throw new Error(`fetch failed — ${detail} (URL: ${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function tfsPost(url: string, auth: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return res;
  } catch (err) {
    // Enrich generic "fetch failed" with the underlying cause
    const cause = (err as { cause?: { message?: string; code?: string } })?.cause;
    if (cause) {
      const detail = [cause.code, cause.message].filter(Boolean).join(": ");
      throw new Error(`fetch failed — ${detail} (URL: ${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchItemsByIds(
  ids: number[],
  auth: string,
  baseUrl: string,
  collection: string,
  project: string,
  apiVersion: string
): Promise<TFSWorkItem[]> {
  const results: TFSWorkItem[] = [];

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const url =
      `${baseUrl}/${collection}/_apis/wit/workitems` +
      `?ids=${chunk.join(",")}` +
      `&fields=${TFS_FIELDS}` +
      `&api-version=${apiVersion}`;

    const res = await tfsGet(url, auth);

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

/** Fetch TFS work items modified within the last N months using WIQL. months=0 means all time. */
export async function fetchTFSByDateRange(months: number): Promise<TFSWorkItem[]> {
  const { pat, baseUrl, collection, project, apiVersion } = getConfig();
  const auth = Buffer.from(`:${pat}`).toString("base64");

  // Step 1 — WIQL to get IDs
  const dateClause = months > 0
    ? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return ` AND [System.ChangedDate] >= '${d.toISOString().slice(0, 10)}'`;
      })()
    : "";

  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project}'${dateClause} ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlUrl = `${baseUrl}/${collection}/_apis/wit/wiql?api-version=${apiVersion}`;
  const wiqlRes = await tfsPost(wiqlUrl, auth, wiql);

  if (!wiqlRes.ok) {
    const errText = await wiqlRes.text();
    throw new Error(`TFS WIQL ${wiqlRes.status}: ${errText}`);
  }

  const wiqlData = await wiqlRes.json() as { workItems?: { id: number }[] };
  const ids = (wiqlData.workItems ?? []).map((w) => w.id);

  if (ids.length === 0) return [];

  // Step 2 — batch fetch details
  return fetchItemsByIds(ids, auth, baseUrl, collection, project, apiVersion);
}

/** Fetch specific TFS work items by ID list. */
export async function fetchTFSWorkItemsByIds(ids: number[]): Promise<TFSWorkItem[]> {
  if (ids.length === 0) return [];
  const { pat, baseUrl, collection, project, apiVersion } = getConfig();
  const auth = Buffer.from(`:${pat}`).toString("base64");
  return fetchItemsByIds(ids, auth, baseUrl, collection, project, apiVersion);
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
