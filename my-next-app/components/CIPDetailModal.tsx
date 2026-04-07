"use client";

import { useEffect, useState } from "react";
import { CIPDetail } from "@/app/api/cip/[id]/route";

interface Props {
  cipId: string | null;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  submitted:    "bg-blue-900/40 text-blue-300 border-blue-700/40",
  approved:     "bg-green-900/40 text-green-300 border-green-700/40",
  denied:       "bg-red-900/40 text-red-300 border-red-700/40",
  cancelled:    "bg-gray-700 text-gray-400 border-gray-600",
  "rolled back":"bg-orange-900/40 text-orange-300 border-orange-700/40",
  draft:        "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  failed:       "bg-red-900/60 text-red-300 border-red-700/40",
  successful:   "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
};

function statusClass(s: string) {
  return STATUS_COLORS[s.toLowerCase()] ?? "bg-gray-700 text-gray-400 border-gray-600";
}

function fmt(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-200 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 pb-1 border-b border-gray-800">
        {title}
      </h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {children}
      </dl>
    </div>
  );
}

export default function CIPDetailModal({ cipId, onClose }: Props) {
  const [detail, setDetail]   = useState<CIPDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!cipId) return;
    setDetail(null);
    setError("");
    setLoading(true);

    fetch(`/api/cip/${cipId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        setDetail(data.detail);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [cipId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!cipId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-10 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-3xl bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl mb-10">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-800">
          <div className="min-w-0">
            {loading ? (
              <div className="h-5 w-48 bg-gray-800 rounded animate-pulse" />
            ) : detail ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusClass(detail.cipStatus)}`}>
                    {detail.cipStatus || "—"}
                  </span>
                  {detail.emergencyFlag && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-900/40 text-red-400 border border-red-700/40">
                      Emergency
                    </span>
                  )}
                  {detail.cipType && (
                    <span className="text-xs text-gray-500 px-2 py-1 rounded-full border border-gray-800 bg-gray-900">
                      {detail.cipType}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-white truncate">
                  {detail.chrTicketNumbers || detail.changeName || `CIP #${detail.id}`}
                </h2>
                {detail.clientName && (
                  <p className="text-sm text-gray-400 mt-0.5">{detail.clientName}</p>
                )}
              </>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-7">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-800 rounded w-3/4" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {detail && (
            <>
              <Section title="Overview">
                <Field label="Change Name"          value={detail.changeName} />
                <Field label="CHR Ticket #"         value={detail.chrTicketNumbers} />
                <Field label="Client Ticket #"      value={detail.clientTicketNumbers} />
                <Field label="Client Name"          value={detail.clientName} />
                <Field label="Purpose of Change"    value={detail.purposeOfChange} />
                <Field label="Additional Details"   value={detail.additionalDetails} />
              </Section>

              <Section title="People">
                <Field label="Submitted By"   value={detail.submittedBy} />
                <Field label="Approved By"    value={detail.approvedBy} />
                <Field label="CHR Contacts"   value={detail.chrContacts} />
              </Section>

              <Section title="Dates">
                <Field label="Submission Date"  value={fmt(detail.submissionDate)} />
                <Field label="Scheduled Date"   value={fmt(detail.scheduledDate)} />
                <Field label="Approval Date"    value={fmt(detail.approvalDate)} />
                <Field label="Review Date"      value={fmt(detail.reviewDate)} />
                <Field label="Completion Date"  value={fmt(detail.completionDate)} />
              </Section>

              <Section title="Impact">
                <Field label="Outage Required"        value={detail.outageRequired} />
                <Field label="Estimated Outage"       value={detail.outageDuration} />
                <Field label="Applications Impacted"  value={detail.applicationsImpacted} />
                <Field label="Environments Impacted"  value={detail.environmentsImpacted} />
                <Field label="Domains Impacted"       value={detail.domainsImpacted} />
                <Field label="Servers Impacted"       value={detail.serversImpacted} />
              </Section>

              {(detail.reviewerNotes || detail.successful || detail.changeRolledBack) && (
                <Section title="Outcome">
                  <Field label="Successful"       value={detail.successful} />
                  <Field label="Rolled Back"      value={detail.changeRolledBack} />
                  <Field label="Reviewer Notes"   value={detail.reviewerNotes} />
                </Section>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {detail && (
          <div className="px-6 py-4 border-t border-gray-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
