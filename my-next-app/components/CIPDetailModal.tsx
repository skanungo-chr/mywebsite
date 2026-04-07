"use client";

import { useEffect, useState } from "react";
import { CIPDetail } from "@/app/api/cip/[id]/route";

interface Props {
  cipId: string | null;
  onClose: () => void;
  onEdit?: (id: string) => void;
  isAdmin?: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  submitted:    { bg: "bg-blue-900/30",    text: "text-blue-300",    border: "border-blue-600/50",   dot: "bg-blue-400"   },
  approved:     { bg: "bg-green-900/30",   text: "text-green-300",   border: "border-green-600/50",  dot: "bg-green-400"  },
  denied:       { bg: "bg-red-900/30",     text: "text-red-300",     border: "border-red-600/50",    dot: "bg-red-400"    },
  cancelled:    { bg: "bg-gray-800",       text: "text-gray-400",    border: "border-gray-600",      dot: "bg-gray-500"   },
  "rolled back":{ bg: "bg-orange-900/30",  text: "text-orange-300",  border: "border-orange-600/50", dot: "bg-orange-400" },
  draft:        { bg: "bg-yellow-900/30",  text: "text-yellow-300",  border: "border-yellow-600/50", dot: "bg-yellow-400" },
  failed:       { bg: "bg-red-900/50",     text: "text-red-300",     border: "border-red-700/50",    dot: "bg-red-500"    },
  successful:   { bg: "bg-emerald-900/30", text: "text-emerald-300", border: "border-emerald-600/50",dot: "bg-emerald-400"},
};

function getStatus(s: string) {
  return STATUS_STYLES[s.toLowerCase()] ?? { bg: "bg-gray-800", text: "text-gray-400", border: "border-gray-600", dot: "bg-gray-500" };
}

function fmtDate(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString();
}

function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</dt>
      <dd className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{value}</dd>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const hasContent = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);
  if (!hasContent) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-500">{icon}</span>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
        <div className="flex-1 border-t border-gray-800" />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        {children}
      </dl>
    </div>
  );
}

export default function CIPDetailModal({ cipId, onClose, onEdit, isAdmin }: Props) {
  const [detail, setDetail]   = useState<CIPDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!cipId) return;
    setDetail(null); setError(""); setLoading(true);
    fetch(`/api/cip/${cipId}`)
      .then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setDetail(d.detail); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [cipId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!cipId) return null;

  const st = detail ? getStatus(detail.cipStatus) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-3xl bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl mb-10">

        {/* ── STATUS BANNER ── */}
        {detail && st && (
          <div className={`flex items-center gap-3 px-6 py-3 rounded-t-2xl border-b ${st.bg} ${st.border}`}>
            <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${st.dot}`} />
            <span className={`text-sm font-bold uppercase tracking-widest ${st.text}`}>
              {detail.cipStatus || "Unknown Status"}
            </span>
            {detail.emergencyFlag && (
              <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-900/40 border border-red-700/50 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                </svg>
                Emergency
              </span>
            )}
          </div>
        )}

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-800">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-24" />
                <div className="h-6 bg-gray-800 rounded w-64" />
              </div>
            ) : detail ? (
              <>
                <div className="flex flex-wrap gap-2 mb-1.5">
                  {detail.cipType && (
                    <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2.5 py-0.5 rounded-full">
                      {detail.cipType}
                    </span>
                  )}
                  {detail.category && (
                    <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2.5 py-0.5 rounded-full">
                      {detail.category}
                    </span>
                  )}
                  {detail.saasClient === "Yes" && (
                    <span className="text-xs text-purple-300 bg-purple-900/30 border border-purple-700/40 px-2.5 py-0.5 rounded-full">SaaS</span>
                  )}
                  {detail.slaClient === "Yes" && (
                    <span className="text-xs text-cyan-300 bg-cyan-900/30 border border-cyan-700/40 px-2.5 py-0.5 rounded-full">SLA</span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-white leading-snug">
                  {detail.chrTicketNumbers || detail.changeName || `CIP #${detail.id}`}
                </h2>
                {detail.clientName && (
                  <p className="text-sm text-gray-400 mt-0.5">{detail.clientName}</p>
                )}
              </>
            ) : null}
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="px-6 py-5 space-y-6 max-h-[65vh] overflow-y-auto">
          {loading && (
            <div className="space-y-3 animate-pulse py-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`h-4 bg-gray-800 rounded ${i % 3 === 0 ? "w-1/3" : "w-2/3"}`} />
              ))}
            </div>
          )}
          {error && <p className="text-red-400 text-sm py-4">{error}</p>}

          {detail && (
            <>
              {/* Overview */}
              <Section title="Overview" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              }>
                <Field label="Change Name"        value={detail.changeName} />
                <Field label="Client Name"         value={detail.clientName} />
                <Field label="CHR Ticket #"        value={detail.chrTicketNumbers} />
                <Field label="Client Ticket #"     value={detail.clientTicketNumbers} />
                <Field label="CHR SCR #"           value={detail.chrScrNumbers} />
                <Field label="Client PO #"         value={detail.clientPoNumbers} />
                <Field label="DevOps Work Item"    value={detail.devOpsWorkItem} />
                <Field label="Root Cause"          value={detail.rootCause} />
                <Field label="Purpose of Change"   value={detail.purposeOfChange} wide />
                <Field label="Additional Details"  value={detail.additionalDetails} wide />
              </Section>

              {/* People & Contact */}
              <Section title="People & Contact" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              }>
                <Field label="Submitted By"           value={detail.submittedBy} />
                <Field label="Approved By (Client)"   value={detail.approvedBy} />
                <Field label="CHR Contacts"           value={detail.chrContacts} />
                <Field label="CHR Contact Phone"      value={detail.chrContactPhone} />
                <Field label="CHR Contact Email"      value={detail.chrContactEmail} />
                <Field label="Client Contact"         value={detail.clientContactName} />
                <Field label="Client Phone"           value={detail.clientContactPhone} />
                <Field label="Client Email"           value={detail.clientContactEmail} />
                <Field label="Users"                  value={detail.users} />
              </Section>

              {/* Dates */}
              <Section title="Dates" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              }>
                <Field label="Submission Date"      value={fmtDate(detail.submissionDate)} />
                <Field label="Scheduled Date"       value={fmtDate(detail.scheduledDate)} />
                <Field label="Timezone"             value={detail.physicalLocationTimezone} />
                <Field label="Approval Date"        value={fmtDate(detail.approvalDate)} />
                <Field label="Review Date"          value={fmtDate(detail.reviewDate)} />
                <Field label="Completion Date"      value={fmtDate(detail.completionDate)} />
              </Section>

              {/* Impact */}
              <Section title="Impact" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              }>
                <Field label="Outage Required"        value={detail.outageRequired} />
                <Field label="Estimated Duration"     value={detail.outageDuration} />
                <Field label="Outage End"             value={fmtDate(detail.outageEnd)} />
                <Field label="VM Checkpoint Required" value={detail.vmCheckpointRequired} />
                <Field label="Applications Impacted"  value={detail.applicationsImpacted} wide />
                <Field label="Environments Impacted"  value={detail.environmentsImpacted} wide />
                <Field label="Domains Impacted"       value={detail.domainsImpacted} wide />
                <Field label="Servers Impacted"       value={detail.serversImpacted} wide />
              </Section>

              {/* Implementation */}
              <Section title="Implementation" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
              }>
                <Field label="Pre-Implementation Notification"  value={detail.preImplementationNotification}  wide />
                <Field label="Post Implementation Notification" value={detail.postImplementationNotification} wide />
                <Field label="Steps for Implementing"           value={detail.stepsForImplementing}           wide />
                <Field label="Steps for Verifying"              value={detail.stepsForVerifying}              wide />
                <Field label="Steps for Rolling Back"           value={detail.stepsForRollingBack}            wide />
                <Field label="Additional Changes"               value={detail.additionalChanges}              wide />
              </Section>

              {/* Outcome */}
              <Section title="Outcome" icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              }>
                <Field label="CIP Approved"     value={detail.cipApproved} />
                <Field label="CIP Rejected"     value={detail.cipRejected} />
                <Field label="Successful"       value={detail.successful} />
                <Field label="Change Rolled Back" value={detail.changeRolledBack} />
                <Field label="Review Board Notes" value={detail.reviewerNotes} wide />
              </Section>
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        {detail && (
          <div className="px-6 py-3.5 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-600">ID: {detail.id}</span>
            <div className="flex items-center gap-2">
              {isAdmin && onEdit && (
                <button onClick={() => onEdit(detail.id)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  Edit
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
