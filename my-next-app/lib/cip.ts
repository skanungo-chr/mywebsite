import { graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

// Hard-coded from debug output — skips 3 round-trip discovery calls per sync page
const KNOWN_SITE_ID  = "chrsolutionsinc649.sharepoint.com,a9d92a60-44d5-47b7-86de-794f93999cd8,59463312-c77a-4349-8959-a2d659ec9ba3";
const KNOWN_LIST_ID  = "0d4249ce-7b8e-4a8d-bc67-07bc405ac2ce";

// Common name variations to try when the configured list name isn't found
const LIST_NAME_CANDIDATES = [
  "CIP",
  "CIP Records",
  "CIPRecords",
  "Change Implementation Plan",
  "Change Implementation Plans",
  "CIP List",
  "CIPs",
];

export interface CIPRecord {
  id: string;
  chrTicketNumbers: string;
  cipType: string;
  cipStatus: string;
  submissionDate: string;
  emergencyFlag: boolean;
  clientName: string;
  product: string;
  category: string;
}

async function getSiteId(token?: string | null): Promise<string> {
  const data = await graphFetch(
    `/sites/${SHAREPOINT_HOST}:${SITE_PATH}:`,
    token
  ) as { id: string };
  return data.id;
}

async function getAllLists(siteId: string, token?: string | null): Promise<{ displayName: string; id: string }[]> {
  const data = await graphFetch(`/sites/${siteId}/lists`, token) as {
    value: { displayName: string; id: string }[];
  };
  return data.value;
}

async function getListId(siteId: string, listName: string, token?: string | null): Promise<string> {
  const lists = await getAllLists(siteId, token);

  // Try exact match first (case-insensitive)
  let list = lists.find((l) => l.displayName.toLowerCase() === listName.toLowerCase());

  // If not found, try all known candidates
  if (!list) {
    for (const candidate of LIST_NAME_CANDIDATES) {
      list = lists.find((l) => l.displayName.toLowerCase() === candidate.toLowerCase());
      if (list) break;
    }
  }

  // If still not found, include available list names in the error
  if (!list) {
    const available = lists
      .filter((l) => !l.displayName.startsWith("_") && !l.displayName.startsWith("appdata"))
      .map((l) => `"${l.displayName}"`)
      .join(", ");
    throw new Error(
      `CIP list not found on SharePoint site. Available lists: ${available || "none"}. ` +
      `Set SHAREPOINT_LIST_NAME env var to the correct list name.`
    );
  }

  return list.id;
}

const FIELDS_SELECT = "CHR_x0020_Ticket_x0020_Number_x0,formStatus,CIPStatuss,Submission_x0020_Date,Emergency_x0020_Change_x0020__x0,Change_x0020_Name,Product_x0020_and_x0020_Version,Category";

/** SharePoint can return choice fields as strings OR lookup fields as objects */
function extractText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    const v = o.LookupValue ?? o.Value ?? o.DisplayValue ?? o.lookupValue ?? "";
    return String(v).trim();
  }
  return String(val).trim();
}

type SPItem = {
  id: string;
  fields: {
    CHR_x0020_Ticket_x0020_Number_x0?: unknown;
    formStatus?: unknown;
    CIPStatuss?: unknown;
    Submission_x0020_Date?: unknown;
    Emergency_x0020_Change_x0020__x0?: unknown;
    Change_x0020_Name?: unknown;
    Product_x0020_and_x0020_Version?: unknown;
    Category?: unknown;
  };
};

function mapItem(item: SPItem): CIPRecord {
  return {
    id: item.id,
    chrTicketNumbers: extractText(item.fields.CHR_x0020_Ticket_x0020_Number_x0),
    cipType:          extractText(item.fields.formStatus),
    cipStatus:        extractText(item.fields.CIPStatuss),
    submissionDate:   extractText(item.fields.Submission_x0020_Date),
    emergencyFlag:    extractText(item.fields.Emergency_x0020_Change_x0020__x0) === "Yes",
    clientName:       extractText(item.fields.Change_x0020_Name),
    product:          extractText(item.fields.Product_x0020_and_x0020_Version),
    category:         extractText(item.fields.Category),
  };
}

export const FETCH_FROM_YEARS: Record<string, string> = {
  "2026": "2026-01-01T00:00:00Z",
  "2025": "2025-01-01T00:00:00Z",
  "2024": "2024-01-01T00:00:00Z",
  "2023": "2023-01-01T00:00:00Z",
  "All":  "2020-01-01T00:00:00Z",
};

/** Fetch one page of records. Returns records + nextLink for pagination. */
export async function fetchCIPRecordsPage(
  listName?: string | null,
  userToken?: string | null,
  nextLink?: string | null,
  fromYear?: string | null,
): Promise<{ records: CIPRecord[]; nextLink: string | null }> {
  const resolvedList = listName ?? process.env.SHAREPOINT_LIST_NAME ?? "CIP";
  const token = userToken ?? undefined;

  let url: string;
  if (nextLink) {
    url = nextLink;
  } else {
    // Use hard-coded IDs to skip 3 discovery round-trips (getSiteId + getAllLists + getListId)
    // which was burning the Vercel 10s timeout before the first record was fetched.
    // Update KNOWN_SITE_ID / KNOWN_LIST_ID if the SharePoint site is ever migrated.
    let siteId = KNOWN_SITE_ID;
    let listId = KNOWN_LIST_ID;
    if (!siteId || !listId) {
      siteId = await getSiteId(token);
      listId = await getListId(siteId, resolvedList, token);
    }
    const fromDate = FETCH_FROM_YEARS[fromYear ?? "2025"] ?? FETCH_FROM_YEARS["2025"];
    const dateFilter = `fields/Submission_x0020_Date ge '${fromDate}'`;
    const folderFilter = `fields/ContentType ne 'Folder'`;
    url = `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=${FIELDS_SELECT})&$filter=${folderFilter} and ${dateFilter}&$orderby=fields/Submission_x0020_Date desc&$top=25`;
  }

  const page = await graphFetch(url, token) as { value: SPItem[]; "@odata.nextLink"?: string };
  return {
    records: page.value.map(mapItem),
    nextLink: page["@odata.nextLink"] ?? null,
  };
}

/** Fetch ALL records (used for non-serverless contexts). */
export async function fetchCIPRecords(
  listName?: string | null,
  userToken?: string | null
): Promise<CIPRecord[]> {
  const all: CIPRecord[] = [];
  let nextLink: string | null = null;
  do {
    const page = await fetchCIPRecordsPage(listName, userToken, nextLink);
    all.push(...page.records);
    nextLink = page.nextLink;
  } while (nextLink);
  return all;
}
