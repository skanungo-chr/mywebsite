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

  const data = await graphFetch(
    `/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,CIPType,CIPStatus,SubmissionDate)&$top=500`,
    token
  ) as {
    value: {
      id: string;
      fields: {
        Title?: string;
        CIPType?: string;
        CIPStatus?: string;
        SubmissionDate?: string;
      };
    }[];
  };

  return data.value.map((item) => ({
    id: item.id,
    chrTicketNumbers: item.fields.Title ?? "",
    cipType: item.fields.CIPType ?? "",
    cipStatus: item.fields.CIPStatus ?? "",
    submissionDate: item.fields.SubmissionDate ?? "",
  }));
}
