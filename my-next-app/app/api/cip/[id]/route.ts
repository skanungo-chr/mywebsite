import { NextResponse } from "next/server";
import { graphFetch } from "@/lib/msgraph";

const SHAREPOINT_HOST = "chrsolutionsinc649.sharepoint.com";
const SITE_PATH = "/sites/CIPCenter";

export interface CIPDetail {
  id: string;
  // Identity
  changeName: string;
  chrTicketNumbers: string;
  clientTicketNumbers: string;
  chrScrNumbers: string;
  clientPoNumbers: string;
  clientName: string;
  cipType: string;
  cipStatus: string;
  emergencyFlag: boolean;
  category: string;
  product: string;
  purposeOfChange: string;
  devOpsWorkItem: string;
  rootCause: string;
  saasClient: string;
  slaClient: string;
  // People & contact
  submittedBy: string;
  approvedBy: string;
  chrContacts: string;
  chrContactPhone: string;
  chrContactEmail: string;
  clientContactName: string;
  clientContactPhone: string;
  clientContactEmail: string;
  users: string;
  // Dates
  submissionDate: string;
  scheduledDate: string;
  physicalLocationTimezone: string;
  approvalDate: string;
  reviewDate: string;
  completionDate: string;
  // Impact
  outageRequired: string;
  outageDuration: string;
  outageEnd: string;
  applicationsImpacted: string;
  environmentsImpacted: string;
  domainsImpacted: string;
  serversImpacted: string;
  vmCheckpointRequired: string;
  // Implementation steps
  stepsForImplementing: string;
  stepsForVerifying: string;
  stepsForRollingBack: string;
  additionalChanges: string;
  additionalDetails: string;
  preImplementationNotification: string;
  postImplementationNotification: string;
  // Outcome
  cipApproved: string;
  cipRejected: string;
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

    const item = await graphFetch(
      `/sites/${siteData.id}/lists/${list.id}/items/${id}?expand=fields`, token
    ) as { id: string; fields: Record<string, unknown> };

    const f = item.fields;
    const s = (key: string) => (f[key] != null ? String(f[key]) : "");

    const detail: CIPDetail = {
      id: item.id,
      changeName:                     s("Title"),
      chrTicketNumbers:               s("CHR_x0020_Ticket_x0020_Number_x0"),
      clientTicketNumbers:            s("Client_x0020_Ticket_x0020_Number"),
      chrScrNumbers:                  s("CHR_x0020_SCR_x0020_Number_x0028"),
      clientPoNumbers:                s("Client_x0020_PO_x0020_Number_x000"),
      clientName:                     s("Change_x0020_Name"),
      cipType:                        s("formStatus"),
      cipStatus:                      s("CIPStatuss"),
      emergencyFlag:                  s("Emergency_x0020_Change_x0020__x0") === "Yes",
      category:                       s("Category"),
      product:                        s("Product"),
      purposeOfChange:                s("Purpose_x0020_of_x0020_Change"),
      devOpsWorkItem:                 s("DevOps_x0020_Work_x0020_Item"),
      rootCause:                      s("Root_x0020_Cause"),
      saasClient:                     s("SaasClient"),
      slaClient:                      s("SLAClient"),
      submittedBy:                    s("Submitted_x0020_By"),
      approvedBy:                     s("Approved_x0020_By_x0020__x0028_C"),
      chrContacts:                    s("CHR_x0020_Contacts"),
      chrContactPhone:                s("CHR_x0020_Contact_x0020_Telephon"),
      chrContactEmail:                s("CHR_x0020_Contact_x0020_Email_x0"),
      clientContactName:              s("Client_x0020_Contact_x0020_Name"),
      clientContactPhone:             s("Client_x0020_Contact_x0020_Telep"),
      clientContactEmail:             s("Client_x0020_Contact_x0020_Email"),
      users:                          s("User_x0028_s_x0029_"),
      submissionDate:                 s("Submission_x0020_Date"),
      scheduledDate:                  s("Scheduled_x0020_Date_x0020_and_x"),
      physicalLocationTimezone:       s("Physical_x0020_Location_x0020_Ti"),
      approvalDate:                   s("Approval_x0020_Date"),
      reviewDate:                     s("Review_x0020_Date"),
      completionDate:                 s("Completion_x0020_Date"),
      outageRequired:                 s("Outage_x0020_Required_x003f_"),
      outageDuration:                 s("Outage_x0020_Duration"),
      outageEnd:                      s("Outage_x0020_End"),
      applicationsImpacted:           s("Application_x0028_s_x0029__x0020"),
      environmentsImpacted:           s("Environment_x0028_s_x0029__x0020"),
      domainsImpacted:                s("Domain_x0028_s_x0029__x0020_Impa"),
      serversImpacted:                s("Server_x0028_s_x0029__x0020_Impa"),
      vmCheckpointRequired:           s("VMCheckpointRequired"),
      stepsForImplementing:           s("Steps_x0020_for_x0020_Implementi"),
      stepsForVerifying:              s("Steps_x0020_for_x0020_Verifying_"),
      stepsForRollingBack:            s("Steps_x0020_for_x0020_Rolling_x0"),
      additionalChanges:              s("Additional_x0020_Changes_x0020_C"),
      additionalDetails:              s("Additional_x0020_Details"),
      preImplementationNotification:  s("Pre_x002d_Implementation_x0020_N"),
      postImplementationNotification: s("Post_x0020_Implementation_x0020_"),
      cipApproved:                    s("CIP_x0020_Approved"),
      cipRejected:                    s("CIP_x0020_Rejected"),
      reviewerNotes:                  s("Approver_x0027_s_x0020_Notes"),
      successful:                     s("Successful_x0020__x0028_Y_x002f_"),
      changeRolledBack:               s("ChangeRolledBack"),
    };

    return NextResponse.json({ success: true, detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
