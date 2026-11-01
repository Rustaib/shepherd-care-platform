"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/field";
import type { ApptState } from "./actions";

export function AppointmentForm({ action, participants, defaults, cancelHref }: {
  action: (s: ApptState, f: FormData) => Promise<ApptState>;
  participants: { id: string; name: string }[];
  defaults: { participant_id?: string; title?: string; date?: string; start?: string; end?: string; location?: string | null; notes?: string | null };
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Participant *" name="participant_id" error={e.participant_id}>
            <select id="participant_id" name="participant_id" className="field" defaultValue={defaults.participant_id ?? ""} required>
              <option value="">— Choose —</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="What *" name="title" defaultValue={defaults.title} error={e.title} placeholder="e.g. GP appointment, physio, day program" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date *" name="date" type="date" defaultValue={defaults.date} error={e.date} />
          <Field label="Start *" name="start" type="time" step={300} defaultValue={defaults.start ?? "10:00"} error={e.start} />
          <Field label="End" name="end" type="time" step={300} defaultValue={defaults.end ?? ""} error={e.end} />
        </div>
        <Field label="Location" name="location" defaultValue={defaults.location ?? ""} />
        <div>
          <label htmlFor="notes" className="label">Notes for staff</label>
          <textarea id="notes" name="notes" rows={3} className="field" defaultValue={defaults.notes ?? ""}
            placeholder="e.g. Bring Medicare card and medication list." />
        </div>
        <p className="text-xs text-muted">The worker rostered with this participant at the time will see it on their shift and in the night-before reminder.</p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save appointment"}</button>
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
