"use client";
import { useActionState, useState } from "react";
import { Field } from "@/components/field";
import { categoryByValue, INCIDENT_CATEGORIES } from "@/lib/incidents";
import { reportIncident } from "./actions";

export function IncidentForm({ shiftId, participants, defaultParticipant, date, time, location }: {
  shiftId: string | null; participants: { id: string; name: string }[]; defaultParticipant?: string | null;
  date: string; time: string; location?: string | null;
}) {
  const [state, action, pending] = useActionState(reportIncident, undefined);
  const [category, setCategory] = useState("");
  const cat = categoryByValue(category);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="shift_id" value={shiftId ?? ""} />
      <section className="card space-y-4">
        <Field label="Participant involved" name="participant_id">
          <select id="participant_id" name="participant_id" className="field" defaultValue={defaultParticipant ?? ""}>
            <option value="">— None / not participant-related —</option>
            {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Type of incident *" name="category">
          <select id="category" name="category" className="field" required value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="" disabled>Choose…</option>
            <optgroup label="Reportable to the NDIS Commission">
              {INCIDENT_CATEGORIES.filter((c) => c.reportable).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
            <optgroup label="Other incidents">
              {INCIDENT_CATEGORIES.filter((c) => !c.reportable).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
          </select>
        </Field>
        {cat?.hint && <p className="-mt-2 text-xs text-muted">{cat.hint}</p>}
        {cat?.reportable && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
            <strong className="text-danger">This may be a reportable incident.</strong> If anyone is in danger call 000 first.
            Phone your manager now as well as submitting this form — it must reach the NDIS Commission within
            {cat.notifyWithin === "24_hours" ? " 24 hours" : " 5 business days"}.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date *" name="date" type="date" defaultValue={date} required />
          <Field label="Time *" name="time" type="time" defaultValue={time} required />
          <Field label="Severity" name="severity">
            <select id="severity" name="severity" className="field" defaultValue="low">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <Field label="Where did it happen?" name="location" defaultValue={location ?? ""} />
      </section>
      <section className="card space-y-4">
        <div>
          <label htmlFor="description" className="label">What happened? *</label>
          <textarea id="description" name="description" rows={6} className="field" required
            placeholder="Describe the facts in order: what led up to it, what happened, who was involved. Stick to what you saw and heard." />
        </div>
        <div>
          <label htmlFor="immediate_action" className="label">What was done straight away? *</label>
          <textarea id="immediate_action" name="immediate_action" rows={3} className="field" required
            placeholder="e.g. first aid given, ambulance called, participant made safe, family notified." />
        </div>
        <Field label="Witnesses" name="witnesses" placeholder="Names and contact details, if any" />
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn bg-danger text-white" disabled={pending}>{pending ? "Submitting…" : "Submit incident report"}</button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
