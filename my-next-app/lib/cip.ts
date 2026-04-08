import { graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

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

export async function fetchCIPRecords(
  listName?: string | null,
  userToken?: string | null
): Promise<CIPRecord[]> {
  const resolvedList = listName ?? process.env.SHAREPOINT_LIST_NAME ?? "CIP";
  const token = userToken ?? undefined;

  const siteId = await getSiteId(token);
  const listId = await getListId(siteId, resolvedList, token);

  type ItemPage = {
    value: {
      id: string;
      fields: {
        CHR_x0020_Ticket_x0020_Number_x0?: string;
        formStatus?: string;
        CIPStatuss?: string;
        Submission_x0020_Date?: string;
        Emergency_x0020_Change_x0020__x0?: string;
        Change_x0020_Name?: string;
        Product?: string;
      };
    }[];
    "@odata.nextLink"?: string;
  };

  const allItems: ItemPage["value"] = [];
  let nextUrl: string | undefined =
    `/sites/${siteId}/lists/${listId}/items?expand=fields(select=CHR_x0020_Ticket_x0020_Number_x0,formStatus,CIPStatuss,Submission_x0020_Date,Emergency_x0020_Change_x0020__x0,Change_x0020_Name,Product)&$filter=fields/ContentType ne 'Folder'&$top=500`;

  while (nextUrl) {
    const page = await graphFetch(nextUrl, token) as ItemPage;
    allItems.push(...page.value);
    nextUrl = page["@odata.nextLink"];
  }

  return allItems.map((item) => ({
    id: item.id,
    chrTicketNumbers: item.fields.CHR_x0020_Ticket_x0020_Number_x0 ?? "",
    cipType: item.fields.formStatus ?? "",
    cipStatus: item.fields.CIPStatuss ?? "",
    submissionDate: item.fields.Submission_x0020_Date ?? "",
    emergencyFlag: item.fields.Emergency_x0020_Change_x0020__x0 === "Yes",
    clientName: item.fields.Change_x0020_Name ?? "",
    product: item.fields.Product ?? "",
  }));
}
