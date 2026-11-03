"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Field } from "@/components/field";
import type { ShiftState } from "./actions";
import type { ParticipantOption, ServiceOption, StaffOption } from "./options";

export type ShiftDefaults = {
  participant_id?: string | null; staff_user_id?: string | null; date?: string; start?: string; end?: string;
  break_minutes?: number; location?: string | null; instructions?: string | null; plan_budget_id?: string | null;
  support_item_code?: string | null; charge_rate?: number | null; status?: string; service_id?: string | null;
};

export function ShiftForm({ action, defaults, staff, participants, services, isNew, cancelHref, locked }: {
  action: (s: ShiftState, f: FormData) => Promise<ShiftState>;
  defaults: ShiftDefaults; staff: StaffOption[]; participants: ParticipantOption[]; services: ServiceOption[];
  isNew: boolean; cancelHref: string; locked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [participantId, setParticipantId] = useState(defaults.participant_id ?? "");
  const [location, setLocation] = useState(defaults.location ?? "");
  const [start, setStart] = useState(defaults.start ?? "09:00");
  const [end, setEnd] = useState(defaults.end ?? "13:00");
  const participant = participants.find((p) => p.id === participantId);
  const e = state?.fieldErrors ?? {};
  const overnight = !!start && !!end && end <= start;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Who</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Participant" name="participant_id">
            <select id="participant_id" name="participant_id" className="field" value={participantId}
              onChange={(ev) => {
                const p = participants.find((x) => x.id === ev.target.value);
                setParticipantId(ev.target.value);
                if (p?.address && !location) setLocation(p.address);
              }}>
              <option value="">— No participant (e.g. training, admin) —</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Support worker" name="staff_user_id" hint="Leave as open shift to fill later">
            <select id="staff_user_id" name="staff_user_id" className="field" defaultValue={defaults.staff_user_id ?? ""}>
              <option value="">— Open shift (unassigned) —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">When</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date" name="date" type="date" defaultValue={defaults.date} error={e.date} required />
          <Field label="Start" name="start" type="time" step={300} value={start} onChange={(ev) => setStart(ev.target.value)} error={e.start} required />
          <Field label="End" name="end" type="time" step={300} value={end} onChange={(ev) => setEnd(ev.target.value)} error={e.end} required
            hint={overnight ? "Finishes the next day" : undefined} />
          <Field label="Unpaid break (min)" name="break_minutes" type="number" min={0} max={240} step={5}
            defaultValue={defaults.break_minutes ?? 0} error={e.break_minutes} />
        </div>
        {isNew && (
          <div className="sm:w-64">
            <Field label="Repeat weekly" name="repeat_weeks">
              <select id="repeat_weeks" name="repeat_weeks" className="field" defaultValue="0">
                <option value="0">Don&apos;t repeat</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>For {n} more week{n > 1 ? "s" : ""}</option>)}
              </select>
            </Field>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Details</h2>
        <Field label="Location" name="location" value={location} onChange={(ev) => setLocation(ev.target.value)} />
        <div>
          <label htmlFor="instructions" className="label">Instructions for the worker</label>
          <textarea id="instructions" name="instructions" rows={3} className="field" defaultValue={defaults.instructions ?? ""}
            placeholder="e.g. Take Jane to her GP appointment at 10:30, then grocery shopping." />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Billing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service" name="service_id" hint={services.length ? "Sets the NDIS item and rate by time of day" : undefined}>
            <select id="service_id" name="service_id" className="field" defaultValue={defaults.service_id ?? ""}>
              <option value="">— Choose a service —</option>
              {services.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Budget" name="plan_budget_id" hint={participant && !participant.budgets.length ? "No budgets on the current plan" : undefined}>
            <select id="plan_budget_id" name="plan_budget_id" className="field" defaultValue={defaults.plan_budget_id ?? ""} key={participantId}>
              <option value="">— Not billed to a budget —</option>
              {participant?.budgets.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
        </div>
        {!services.length && (
          <p className="text-sm text-muted">No services yet — <Link href="/admin/services" className="text-brand underline">set up Services &amp; prices</Link> so shifts can be invoiced automatically.</p>
        )}
        <details className="rounded-xl border border-line p-3 text-sm" open={!!(defaults.support_item_code || defaults.charge_rate)}>
          <summary className="cursor-pointer font-medium">Override the price for this shift</summary>
          <p className="mt-2 text-muted">Bills the whole shift as one item at this rate instead of using the service&apos;s time-of-day prices.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="NDIS support item" name="support_item_code" defaultValue={defaults.support_item_code ?? ""} placeholder="e.g. 01_011_0107_1_1" />
            <Field label="Rate ($/hour)" name="charge_rate" inputMode="decimal" defaultValue={defaults.charge_rate ?? ""} error={e.charge_rate} />
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Visibility</h2>
        {locked ? (
          <p className="text-sm text-muted">This shift is underway or completed, so its status can&apos;t be changed here.</p>
        ) : null}
        {locked && <input type="hidden" name="status" value="published" />}
        {!locked && (
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="status" value="published" defaultChecked={defaults.status !== "draft"} /> Published — the worker can see it</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="status" value="draft" defaultChecked={defaults.status === "draft"} /> Draft — only managers see it</label>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : isNew ? "Create shift" : "Save changes"}</button>
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
