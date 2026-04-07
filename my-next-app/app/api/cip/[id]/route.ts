import { NextResponse } from "next/server";
import { graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

export interface CIPDetail {
  id: string;
  // Header
  changeName: string;
  chrTicketNumbers: string;
  clientTicketNumbers: string;
  clientName: string;
  cipType: string;
  cipStatus: string;
  emergencyFlag: boolean;
  // People
  submittedBy: string;
  approvedBy: string;
  chrContacts: string;
  // Dates
  submissionDate: string;
  scheduledDate: string;
  approvalDate: string;
  reviewDate: string;
  completionDate: string;
  // Impact
  outageRequired: string;
  outageDuration: string;
  applicationsImpacted: string;
  environmentsImpacted: string;
  domainsImpacted: string;
  serversImpacted: string;
  // Details
  purposeOfChange: string;
  additionalDetails: string;
  reviewerNotes: string;
  successful: string;
  changeRolledBack: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const siteData = await graphFetch(
      `/sites/${SHAREPOINT_HOST}:${SITE_PATH}:`,
      token
    ) as { id: string };

    const listName = process.env.SHAREPOINT_LIST_NAME ?? "Change Implementation Plan";
    const listsData = await graphFetch(`/sites/${siteData.id}/lists`, token) as {
      value: { displayName: string; id: string }[];
    };
    const list = listsData.value.find(
      (l) => l.displayName.toLowerCase() === listName.toLowerCase()
    );
    if (!list) throw new Error("CIP list not found");

    const item = await graphFetch(
      `/sites/${siteData.id}/lists/${list.id}/items/${id}?expand=fields`,
      token
    ) as {
      id: string;
      fields: Record<string, string | boolean | null | undefined>;
    };

    const f = item.fields;
    const detail: CIPDetail = {
      id: item.id,
      changeName:           String(f["Title"]                               ?? ""),
      chrTicketNumbers:     String(f["CHR_x0020_Ticket_x0020_Number_x0"]   ?? ""),
      clientTicketNumbers:  String(f["Client_x0020_Ticket_x0020_Number"]    ?? ""),
      clientName:           String(f["Change_x0020_Name"]                   ?? ""),
      cipType:              String(f["formStatus"]                          ?? ""),
      cipStatus:            String(f["CIPStatuss"]                          ?? ""),
      emergencyFlag:        String(f["Emergency_x0020_Change_x0020__x0"])   === "Yes",
      submittedBy:          String(f["Submitted_x0020_By"]                  ?? ""),
      approvedBy:           String(f["Approved_x0020_By_x0020__x0028_C"]   ?? ""),
      chrContacts:          String(f["CHR_x0020_Contacts"]                  ?? ""),
      submissionDate:       String(f["Submission_x0020_Date"]               ?? ""),
      scheduledDate:        String(f["Scheduled_x0020_Date_x0020_and_x"]   ?? ""),
      approvalDate:         String(f["Approval_x0020_Date"]                 ?? ""),
      reviewDate:           String(f["Review_x0020_Date"]                   ?? ""),
      completionDate:       String(f["Completion_x0020_Date"]               ?? ""),
      outageRequired:       String(f["Outage_x0020_Required_x003f_"]        ?? ""),
      outageDuration:       String(f["Outage_x0020_Duration"]               ?? ""),
      applicationsImpacted: String(f["Application_x0028_s_x0029__x0020"]   ?? ""),
      environmentsImpacted: String(f["Environment_x0028_s_x0029__x0020"]   ?? ""),
      domainsImpacted:      String(f["Domain_x0028_s_x0029__x0020_Impa"]   ?? ""),
      serversImpacted:      String(f["Server_x0028_s_x0029__x0020_Impa"]   ?? ""),
      purposeOfChange:      String(f["Purpose_x0020_of_x0020_Change"]       ?? ""),
      additionalDetails:    String(f["Additional_x0020_Details"]            ?? ""),
      reviewerNotes:        String(f["Approver_x0027_s_x0020_Notes"]        ?? ""),
      successful:           String(f["Successful_x0020__x0028_Y_x002f_"]   ?? ""),
      changeRolledBack:     String(f["ChangeRolledBack"]                    ?? ""),
    };

    return NextResponse.json({ success: true, detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
