import { NextResponse } from "next/server";
import { fetchCIPRecords } from "@/lib/cip";
import { graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

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

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await request.json();

    const siteData = await graphFetch(
      `/sites/${SHAREPOINT_HOST}:${SITE_PATH}:`, token
    ) as { id: string };

    const listName = process.env.SHAREPOINT_LIST_NAME ?? "Change Implementation Plan";
    const listsData = await graphFetch(`/sites/${siteData.id}/lists`, token) as {
      value: { displayName: string; id: string }[];
    };
    const list = listsData.value.find(
      (l) => l.displayName.toLowerCase() === listName.toLowerCase()
    );
    if (!list) throw new Error("CIP list not found");

    const fields: Record<string, string | boolean> = {};
    if (body.changeName)                    fields["Title"]                               = body.changeName;
    if (body.clientName)                    fields["Change_x0020_Name"]                   = body.clientName;
    if (body.chrTicketNumbers)              fields["CHR_x0020_Ticket_x0020_Number_x0"]    = body.chrTicketNumbers;
    if (body.clientTicketNumbers)           fields["Client_x0020_Ticket_x0020_Number"]    = body.clientTicketNumbers;
    if (body.cipType)                       fields["formStatus"]                          = body.cipType;
    if (body.purposeOfChange)               fields["Purpose_x0020_of_x0020_Change"]       = body.purposeOfChange;
    if (body.additionalDetails)             fields["Additional_x0020_Details"]            = body.additionalDetails;
    if (body.submissionDate)                fields["Submission_x0020_Date"]               = body.submissionDate;
    if (body.scheduledDate)                 fields["Scheduled_x0020_Date_x0020_and_x"]   = body.scheduledDate;
    if (body.emergencyFlag !== undefined)   fields["Emergency_x0020_Change_x0020__x0"]   = body.emergencyFlag ? "Yes" : "No";
    if (body.outageRequired)                fields["Outage_x0020_Required_x003f_"]        = body.outageRequired;
    if (body.outageDuration)                fields["Outage_x0020_Duration"]               = body.outageDuration;
    if (body.applicationsImpacted)          fields["Application_x0028_s_x0029__x0020"]   = body.applicationsImpacted;
    if (body.environmentsImpacted)          fields["Environment_x0028_s_x0029__x0020"]   = body.environmentsImpacted;
    if (body.domainsImpacted)               fields["Domain_x0028_s_x0029__x0020_Impa"]   = body.domainsImpacted;
    if (body.serversImpacted)               fields["Server_x0028_s_x0029__x0020_Impa"]   = body.serversImpacted;
    if (body.submittedBy)                   fields["Submitted_x0020_By"]                  = body.submittedBy;
    if (body.chrContacts)                   fields["CHR_x0020_Contacts"]                  = body.chrContacts;
    if (body.clientContactName)             fields["Client_x0020_Contact_x0020_Name"]     = body.clientContactName;
    if (body.clientContactPhone)            fields["Client_x0020_Contact_x0020_Telep"]    = body.clientContactPhone;
    if (body.clientContactEmail)            fields["Client_x0020_Contact_x0020_Email"]    = body.clientContactEmail;
    if (body.stepsForImplementing)          fields["Steps_x0020_for_x0020_Implementi"]    = body.stepsForImplementing;
    if (body.stepsForVerifying)             fields["Steps_x0020_for_x0020_Verifying_"]    = body.stepsForVerifying;
    if (body.stepsForRollingBack)           fields["Steps_x0020_for_x0020_Rolling_x0"]    = body.stepsForRollingBack;
    if (body.preImplementationNotification) fields["Pre_x002d_Implementation_x0020_N"]   = body.preImplementationNotification;
    if (body.postImplementationNotification)fields["Post_x0020_Implementation_x0020_"]   = body.postImplementationNotification;

    const created = await graphFetch(
      `/sites/${siteData.id}/lists/${list.id}/items`,
      token,
      { method: "POST", body: JSON.stringify({ fields }) }
    ) as { id: string };

    return NextResponse.json({ success: true, id: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
