"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Field } from "@/components/field";
import { shiftsForAppointment, type ApptState, type ShiftChoice } from "./actions";

export function AppointmentForm({ action, participants, defaults, cancelHref }: {
  action: (s: ApptState, f: FormData) => Promise<ApptState>;
  participants: { id: string; name: string }[];
  defaults: { participant_id?: string; title?: string; date?: string; start?: string; end?: string; location?: string | null; notes?: string | null; shift_id?: string | null };
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const [participantId, setParticipantId] = useState(defaults.participant_id ?? "");
  const [date, setDate] = useState(defaults.date ?? "");
  const [shiftId, setShiftId] = useState(defaults.shift_id ?? "");
  const [shifts, setShifts] = useState<ShiftChoice[] | null>(null);

  // Load that participant's shifts for the chosen day
  useEffect(() => {
    let live = true;
    if (!participantId || !date) { setShifts(null); return; }
    shiftsForAppointment(participantId, date).then((list) => {
      if (!live) return;
      setShifts(list);
      if (shiftId && !list.some((x) => x.id === shiftId)) setShiftId("");
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, date]);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Participant *" name="participant_id" error={e.participant_id}>
            <select id="participant_id" name="participant_id" className="field" value={participantId} onChange={(ev) => setParticipantId(ev.target.value)} required>
              <option value="">— Choose —</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="What *" name="title" defaultValue={defaults.title} error={e.title} placeholder="e.g. GP appointment, physio, day program" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date *" name="date" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} error={e.date} />
          <Field label="Start *" name="start" type="time" step={300} defaultValue={defaults.start ?? "10:00"} error={e.start} />
          <Field label="End" name="end" type="time" step={300} defaultValue={defaults.end ?? ""} error={e.end} />
        </div>
        <Field label="Location" name="location" defaultValue={defaults.location ?? ""} />
        <div>
          <label htmlFor="notes" className="label">Notes for staff</label>
          <textarea id="notes" name="notes" rows={3} className="field" defaultValue={defaults.notes ?? ""}
            placeholder="e.g. Bring Medicare card and medication list." />
        </div>
        <Field label="Link to shift" name="shift_id">
          <select id="shift_id" name="shift_id" className="field" value={shiftId} onChange={(ev) => setShiftId(ev.target.value)} disabled={!shifts}>
            <option value="">{shifts && !shifts.length ? "No shifts that day — the worker on shift will be found automatically" : "Automatic — the shift covering this time"}</option>
            {shifts?.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <p className="-mt-2 text-xs text-muted">
          The worker on the linked shift sees the appointment on their shift with directions, gets it in their night-before reminder,
          and gets a reminder about an hour beforehand. Link a shift when the appointment falls outside the shift&apos;s hours
          (e.g. the worker drives the participant there).
        </p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save appointment"}</button>
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
