"use client";

import { useEffect, useState } from "react";
import { CIPDetail } from "@/app/api/cip/[id]/route";

interface Props {
  cipId: string | null;
  onClose: () => void;
  onSaved: () => void;
  msAccessToken?: string | null;
}

interface FormData {
  changeName: string;
  cipType: string;
  submissionDate: string;
  purposeOfChange: string;
  submittedBy: string;
  clientName: string;
  chrTicketNumbers: string;
  clientTicketNumbers: string;
  scheduledDate: string;
  emergencyFlag: boolean;
  outageRequired: string;
  outageDuration: string;
  applicationsImpacted: string;
  environmentsImpacted: string;
  domainsImpacted: string;
  serversImpacted: string;
  chrContacts: string;
  clientContactName: string;
  clientContactPhone: string;
  clientContactEmail: string;
  stepsForImplementing: string;
  stepsForVerifying: string;
  stepsForRollingBack: string;
  additionalDetails: string;
  preImplementationNotification: string;
  postImplementationNotification: string;
}

type Errors = Partial<Record<keyof FormData, string>>;
type Tab = "Overview" | "Schedule & Impact" | "Contacts" | "Steps";
const TABS: Tab[] = ["Overview", "Schedule & Impact", "Contacts", "Steps"];
const CIP_TYPES = ["Standard", "Emergency", "Minor", "Major", "Patch", "Upgrade", "Migration", "Other"];

function fmtDateInput(iso: string) {
  if (!iso) return "";
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
}
function fmtDatetimeInput(iso: string) {
  if (!iso) return "";
  try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
}

function detailToForm(d: CIPDetail): FormData {
  return {
    changeName:                     d.changeName,
    cipType:                        d.cipType,
    submissionDate:                 fmtDateInput(d.submissionDate),
    purposeOfChange:                d.purposeOfChange,
    submittedBy:                    d.submittedBy,
    clientName:                     d.clientName,
    chrTicketNumbers:               d.chrTicketNumbers,
    clientTicketNumbers:            d.clientTicketNumbers,
    scheduledDate:                  fmtDatetimeInput(d.scheduledDate),
    emergencyFlag:                  d.emergencyFlag,
    outageRequired:                 d.outageRequired || "No",
    outageDuration:                 d.outageDuration,
    applicationsImpacted:           d.applicationsImpacted,
    environmentsImpacted:           d.environmentsImpacted,
    domainsImpacted:                d.domainsImpacted,
    serversImpacted:                d.serversImpacted,
    chrContacts:                    d.chrContacts,
    clientContactName:              d.clientContactName,
    clientContactPhone:             d.clientContactPhone,
    clientContactEmail:             d.clientContactEmail,
    stepsForImplementing:           d.stepsForImplementing,
    stepsForVerifying:              d.stepsForVerifying,
    stepsForRollingBack:            d.stepsForRollingBack,
    additionalDetails:              d.additionalDetails,
    preImplementationNotification:  d.preImplementationNotification,
    postImplementationNotification: d.postImplementationNotification,
  };
}

function validate(form: FormData): Errors {
  const e: Errors = {};
  if (!form.changeName.trim())       e.changeName      = "Change name is required";
  if (!form.cipType)                 e.cipType         = "CIP type is required";
  if (!form.submissionDate)          e.submissionDate  = "Submission date is required";
  if (!form.purposeOfChange.trim())  e.purposeOfChange = "Purpose of change is required";
  if (!form.submittedBy.trim())      e.submittedBy     = "Submitted by is required";
  if (form.scheduledDate && form.submissionDate && form.scheduledDate.slice(0,10) < form.submissionDate) {
    e.scheduledDate = "Scheduled date must be after submission date";
  }
  if (form.clientContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientContactEmail)) {
    e.clientContactEmail = "Invalid email address";
  }
  return e;
}

// ── Shared field components ────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );
}
function Input({ value, onChange, placeholder, error, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: string; type?: string;
}) {
  return (
    <div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full bg-gray-900 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition-colors ${
          error ? "border-red-600 focus:ring-red-500" : "border-gray-700 focus:border-indigo-500 focus:ring-indigo-500"}`}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
function Textarea({ value, onChange, placeholder, error, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: string; rows?: number;
}) {
  return (
    <div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className={`w-full bg-gray-900 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition-colors resize-none ${
          error ? "border-red-600 focus:ring-red-500" : "border-gray-700 focus:border-indigo-500 focus:ring-indigo-500"}`}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
function Select({ value, onChange, options, error }: {
  value: string; onChange: (v: string) => void; options: string[]; error?: string;
}) {
  return (
    <div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-gray-900 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 transition-colors ${
          error ? "border-red-600 focus:ring-red-500" : "border-gray-700 focus:border-indigo-500 focus:ring-indigo-500"}`}
      >
        <option value="">Select...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export default function CIPEditModal({ cipId, onClose, onSaved, msAccessToken }: Props) {
  const [form, setForm]           = useState<FormData | null>(null);
  const [errors, setErrors]       = useState<Errors>({});
  const [tab, setTab]             = useState<Tab>("Overview");
  const [loading, setLoading]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!cipId) return;
    setForm(null); setErrors({}); setTab("Overview"); setSubmitError("");
    setLoading(true);
    fetch(`/api/cip/${cipId}`)
      .then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setForm(detailToForm(d.detail)); })
      .catch((e) => setSubmitError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [cipId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const set = <K extends keyof FormData>(key: K) => (val: FormData[K]) =>
    setForm((f) => f ? { ...f, [key]: val } : f);

  const handleSave = async () => {
    if (!form || !cipId) return;
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const overviewKeys: (keyof FormData)[] = ["changeName","cipType","submissionDate","purposeOfChange","submittedBy"];
      const scheduleKeys: (keyof FormData)[] = ["scheduledDate"];
      const contactKeys:  (keyof FormData)[] = ["clientContactEmail"];
      if (overviewKeys.some((k) => errs[k])) setTab("Overview");
      else if (scheduleKeys.some((k) => errs[k])) setTab("Schedule & Impact");
      else if (contactKeys.some((k) => errs[k])) setTab("Contacts");
      return;
    }
    setSubmitting(true); setSubmitError("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (msAccessToken) headers["Authorization"] = `Bearer ${msAccessToken}`;
      const res  = await fetch(`/api/cip/${cipId}`, { method: "PATCH", headers, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (!cipId) return null;

  const tabErrors: Record<Tab, boolean> = {
    "Overview":          ["changeName","cipType","submissionDate","purposeOfChange","submittedBy"].some((k) => errors[k as keyof FormData]),
    "Schedule & Impact": ["scheduledDate"].some((k) => errors[k as keyof FormData]),
    "Contacts":          ["clientContactEmail"].some((k) => errors[k as keyof FormData]),
    "Steps":             false,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl mb-10">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Edit CIP Record</h2>
            <p className="text-xs text-gray-500 mt-0.5">Updates the record in SharePoint</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative px-3 py-3 text-sm font-medium transition-colors ${
                tab === t ? "text-white border-b-2 border-indigo-500 -mb-px" : "text-gray-500 hover:text-gray-300"}`}
            >
              {t}
              {tabErrors[t] && <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="space-y-3 animate-pulse py-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`h-9 bg-gray-800 rounded-lg ${i % 2 === 0 ? "w-full" : "w-2/3"}`} />
              ))}
            </div>
          )}

          {!loading && form && (
            <div className="space-y-4">

              {/* ── OVERVIEW ── */}
              {tab === "Overview" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label required>Change Name</Label>
                    <Input value={form.changeName} onChange={set("changeName")} placeholder="Brief description of the change" error={errors.changeName} />
                  </div>
                  <div>
                    <Label required>CIP Type</Label>
                    <Select value={form.cipType} onChange={set("cipType")} options={CIP_TYPES} error={errors.cipType} />
                  </div>
                  <div>
                    <Label required>Submission Date</Label>
                    <Input value={form.submissionDate} onChange={set("submissionDate")} type="date" error={errors.submissionDate} />
                  </div>
                  <div>
                    <Label required>Submitted By</Label>
                    <Input value={form.submittedBy} onChange={set("submittedBy")} placeholder="Your name" error={errors.submittedBy} />
                  </div>
                  <div>
                    <Label>Client Name</Label>
                    <Input value={form.clientName} onChange={set("clientName")} placeholder="Client / organization name" />
                  </div>
                  <div>
                    <Label>CHR Ticket #(s)</Label>
                    <Input value={form.chrTicketNumbers} onChange={set("chrTicketNumbers")} placeholder="e.g. CHR-1234" />
                  </div>
                  <div>
                    <Label>Client Ticket #(s)</Label>
                    <Input value={form.clientTicketNumbers} onChange={set("clientTicketNumbers")} placeholder="Client-side ticket numbers" />
                  </div>
                  <div className="col-span-2">
                    <Label required>Purpose of Change</Label>
                    <Textarea value={form.purposeOfChange} onChange={set("purposeOfChange")} placeholder="Describe why this change is needed..." error={errors.purposeOfChange} rows={3} />
                  </div>
                  <div className="col-span-2">
                    <Label>Additional Details</Label>
                    <Textarea value={form.additionalDetails} onChange={set("additionalDetails")} placeholder="Any other relevant information..." rows={2} />
                  </div>
                  <div className="col-span-2">
                    <div
                      onClick={() => set("emergencyFlag")(!form.emergencyFlag)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        form.emergencyFlag ? "bg-red-900/20 border-red-700/50 text-red-300" : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"}`}
                    >
                      <div className={`w-9 h-5 rounded-full transition-colors relative ${form.emergencyFlag ? "bg-red-600" : "bg-gray-700"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.emergencyFlag ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Emergency Change</p>
                        <p className="text-xs text-gray-500">Mark this as an emergency change request</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SCHEDULE & IMPACT ── */}
              {tab === "Schedule & Impact" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Scheduled Date &amp; Time</Label>
                    <Input value={form.scheduledDate} onChange={set("scheduledDate")} type="datetime-local" error={errors.scheduledDate} />
                  </div>
                  <div>
                    <Label>Outage Required</Label>
                    <Select value={form.outageRequired} onChange={set("outageRequired")} options={["Yes", "No"]} />
                  </div>
                  {form.outageRequired === "Yes" && (
                    <div>
                      <Label>Estimated Outage Duration</Label>
                      <Input value={form.outageDuration} onChange={set("outageDuration")} placeholder="e.g. 2 hours" />
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label>Application(s) Impacted</Label>
                    <Textarea value={form.applicationsImpacted} onChange={set("applicationsImpacted")} placeholder="List applications..." rows={2} />
                  </div>
                  <div className="col-span-2">
                    <Label>Environment(s) Impacted</Label>
                    <Textarea value={form.environmentsImpacted} onChange={set("environmentsImpacted")} placeholder="e.g. Production, Staging..." rows={2} />
                  </div>
                  <div className="col-span-2">
                    <Label>Domain(s) Impacted</Label>
                    <Textarea value={form.domainsImpacted} onChange={set("domainsImpacted")} placeholder="List affected domains..." rows={2} />
                  </div>
                  <div className="col-span-2">
                    <Label>Server(s) Impacted</Label>
                    <Textarea value={form.serversImpacted} onChange={set("serversImpacted")} placeholder="List affected servers..." rows={2} />
                  </div>
                </div>
              )}

              {/* ── CONTACTS ── */}
              {tab === "Contacts" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>CHR Contacts</Label>
                    <Input value={form.chrContacts} onChange={set("chrContacts")} placeholder="CHR team contacts" />
                  </div>
                  <div className="col-span-2 border-t border-gray-800 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Client Contact</p>
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={form.clientContactName} onChange={set("clientContactName")} placeholder="Full name" />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input value={form.clientContactPhone} onChange={set("clientContactPhone")} type="tel" placeholder="Phone number" />
                  </div>
                  <div className="col-span-2">
                    <Label>Contact Email</Label>
                    <Input value={form.clientContactEmail} onChange={set("clientContactEmail")} type="email" placeholder="email@example.com" error={errors.clientContactEmail} />
                  </div>
                </div>
              )}

              {/* ── STEPS ── */}
              {tab === "Steps" && (
                <div className="space-y-4">
                  <div>
                    <Label>Pre-Implementation Notification</Label>
                    <Textarea value={form.preImplementationNotification} onChange={set("preImplementationNotification")} placeholder="Notification verbiage before implementation..." rows={3} />
                  </div>
                  <div>
                    <Label>Steps for Implementing</Label>
                    <Textarea value={form.stepsForImplementing} onChange={set("stepsForImplementing")} placeholder="Step-by-step implementation instructions..." rows={4} />
                  </div>
                  <div>
                    <Label>Steps for Verifying</Label>
                    <Textarea value={form.stepsForVerifying} onChange={set("stepsForVerifying")} placeholder="How to verify the change was successful..." rows={3} />
                  </div>
                  <div>
                    <Label>Steps for Rolling Back</Label>
                    <Textarea value={form.stepsForRollingBack} onChange={set("stepsForRollingBack")} placeholder="How to roll back if something goes wrong..." rows={3} />
                  </div>
                  <div>
                    <Label>Post Implementation Notification</Label>
                    <Textarea value={form.postImplementationNotification} onChange={set("postImplementationNotification")} placeholder="Notification verbiage after implementation..." rows={3} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setTab(TABS[Math.max(0, TABS.indexOf(tab) - 1)])} disabled={tab === TABS[0]}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              ← Back
            </button>
            <button onClick={() => setTab(TABS[Math.min(TABS.length - 1, TABS.indexOf(tab) + 1)])} disabled={tab === TABS[TABS.length - 1]}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Next →
            </button>
          </div>
          <div className="flex items-center gap-3">
            {submitError && <p className="text-xs text-red-400 max-w-xs truncate">{submitError}</p>}
            <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={submitting || loading}
              className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors">
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
