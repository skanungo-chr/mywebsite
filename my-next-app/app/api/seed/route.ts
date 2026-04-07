import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";

const SAMPLE_RECORDS = [
  { id: "CIP-001", chrTicketNumbers: "CHR-10001", cipType: "Network Change",        cipStatus: "Completed",   submissionDate: "2025-11-15" },
  { id: "CIP-002", chrTicketNumbers: "CHR-10002", cipType: "Software Deployment",   cipStatus: "Completed",   submissionDate: "2025-11-22" },
  { id: "CIP-003", chrTicketNumbers: "CHR-10003", cipType: "Infrastructure Update", cipStatus: "In Progress", submissionDate: "2025-12-01" },
  { id: "CIP-004", chrTicketNumbers: "CHR-10004", cipType: "Security Patch",        cipStatus: "Open",        submissionDate: "2025-12-10" },
  { id: "CIP-005", chrTicketNumbers: "CHR-10005", cipType: "Database Migration",    cipStatus: "In Progress", submissionDate: "2025-12-18" },
  { id: "CIP-006", chrTicketNumbers: "CHR-10006", cipType: "Network Change",        cipStatus: "Open",        submissionDate: "2026-01-05" },
  { id: "CIP-007", chrTicketNumbers: "CHR-10007", cipType: "Software Deployment",   cipStatus: "Completed",   submissionDate: "2026-01-12" },
  { id: "CIP-008", chrTicketNumbers: "CHR-10008", cipType: "Hardware Replacement",  cipStatus: "Closed",      submissionDate: "2026-01-20" },
  { id: "CIP-009", chrTicketNumbers: "CHR-10009", cipType: "Infrastructure Update", cipStatus: "Open",        submissionDate: "2026-02-03" },
  { id: "CIP-010", chrTicketNumbers: "CHR-10010", cipType: "Security Patch",        cipStatus: "In Progress", submissionDate: "2026-02-14" },
  { id: "CIP-011", chrTicketNumbers: "CHR-10011", cipType: "Software Deployment",   cipStatus: "Open",        submissionDate: "2026-02-28" },
  { id: "CIP-012", chrTicketNumbers: "CHR-10012", cipType: "Database Migration",    cipStatus: "Closed",      submissionDate: "2026-03-07" },
  { id: "CIP-013", chrTicketNumbers: "CHR-10013", cipType: "Network Change",        cipStatus: "In Progress", submissionDate: "2026-03-15" },
  { id: "CIP-014", chrTicketNumbers: "CHR-10014", cipType: "Hardware Replacement",  cipStatus: "Open",        submissionDate: "2026-03-22" },
  { id: "CIP-015", chrTicketNumbers: "CHR-10015", cipType: "Security Patch",        cipStatus: "Completed",   submissionDate: "2026-04-01" },
];

export async function POST() {
  try {
    const batch = writeBatch(db);
    const colRef = collection(db, "cip_records");

    for (const record of SAMPLE_RECORDS) {
      const ref = doc(colRef, record.id);
      batch.set(ref, {
        chrTicketNumbers: record.chrTicketNumbers,
        cipType:          record.cipType,
        cipStatus:        record.cipStatus,
        submissionDate:   record.submissionDate,
        lastSyncedAt:     serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    return NextResponse.json({ success: true, seeded: SAMPLE_RECORDS.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
