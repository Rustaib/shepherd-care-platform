"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { EXPENSE_CATEGORIES } from "@/lib/claims";
import { addExpense, addKm, addNote, clockIn, clockOut, requestExtraHours, updateNote, withdrawClaim, type ActionResult } from "./actions";

function Feedback({ state }: { state: ActionResult }) {
  if (!state) return null;
  return state.error
    ? <p role="alert" className="text-sm text-danger">{state.error}</p>
    : <p role="status" className="text-sm text-success">{state.ok}</p>;
}

/** Reset a form after a successful submit. */
function useResetOnOk(state: ActionResult) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return ref;
}

export function ClockPanel({ shiftId, status, canClockIn }: { shiftId: string; status: string; canClockIn: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>(undefined);

  const doClockIn = () => start(async () => {
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 6000, maximumAge: 60000 });
    });
    setResult(await clockIn(shiftId, pos?.coords.latitude ?? null, pos?.coords.longitude ?? null));
  });

  if (status === "published") {
    return (
      <div className="space-y-2">
        <button onClick={doClockIn} disabled={pending || !canClockIn} className="btn-primary w-full py-3.5 text-base">
          {pending ? "Clocking in…" : "Clock in"}
        </button>
        {!canClockIn && <p className="text-center text-xs text-muted">Clock-in opens 2 hours before the shift starts.</p>}
        <Feedback state={result} />
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="space-y-2">
        <button onClick={() => start(async () => setResult(await clockOut(shiftId)))} disabled={pending}
          className="btn w-full bg-ink py-3.5 text-base text-card">{pending ? "Clocking out…" : "Clock out"}</button>
        <Feedback state={result} />
      </div>
    );
  }
  return <Feedback state={result} />;
}

export function NoteForm({ shiftId, goals }: { shiftId: string; goals: string[] }) {
  const [state, action, pending] = useActionState(addNote.bind(null, shiftId), undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <textarea name="body" rows={5} required className="field"
        placeholder="What support did you provide? How was the participant (mood, health, wellbeing)? Any changes, concerns or follow-ups?" />
      {goals.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Goals worked on</legend>
          <div className="space-y-1.5">
            {goals.map((g) => (
              <label key={g} className="flex items-start gap-2 text-sm"><input type="checkbox" name="goals" value={g} className="mt-1" /> {g}</label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save note"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function EditableNote({ id, shiftId, body, canEdit }: { id: string; shiftId: string; body: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>(undefined);
  if (!editing) {
    return (
      <div>
        <p className="whitespace-pre-wrap text-sm">{body}</p>
        {canEdit && <button className="mt-1 text-xs text-brand underline" onClick={() => setEditing(true)}>Edit</button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <textarea className="field" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="btn-primary py-1.5" disabled={pending} onClick={() => start(async () => {
          const r = await updateNote(id, shiftId, text); setResult(r); if (r?.ok) setEditing(false);
        })}>Save</button>
        <button className="btn-ghost py-1.5" onClick={() => { setEditing(false); setText(body); }}>Cancel</button>
        <Feedback state={result} />
      </div>
    </div>
  );
}

export function ExpenseForm({ shiftId, date }: { shiftId: string; date: string }) {
  const [state, action, pending] = useActionState(addExpense.bind(null, shiftId), undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <select name="category" className="field" aria-label="Category" required defaultValue="">
          <option value="" disabled>Category…</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input name="amount" inputMode="decimal" placeholder="Amount $" className="field" aria-label="Amount" required />
        <input name="incurred_on" type="date" defaultValue={date} className="field" aria-label="Date" required />
      </div>
      <input name="description" className="field" placeholder="What was it for?" aria-label="Description" required />
      <label className="block text-sm">
        <span className="label">Receipt (photo or PDF)</span>
        <input type="file" name="receipt" accept="image/*,application/pdf" capture="environment" className="text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Submitting…" : "Submit expense"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function KmForm({ shiftId, date, defaultFrom }: { shiftId: string; date: string; defaultFrom?: string }) {
  const [state, action, pending] = useActionState(addKm.bind(null, shiftId), undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <input name="kilometres" inputMode="decimal" placeholder="km" className="field" aria-label="Kilometres" required />
        <input name="travelled_on" type="date" defaultValue={date} className="field" aria-label="Date" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="from_location" className="field" placeholder="From" aria-label="From" defaultValue={defaultFrom} />
        <input name="to_location" className="field" placeholder="To" aria-label="To" />
      </div>
      <input name="purpose" className="field" placeholder="Purpose, e.g. drove Jane to physio" aria-label="Purpose" required />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Log kilometres"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ExtraHoursForm({ shiftId }: { shiftId: string }) {
  const [state, action, pending] = useActionState(requestExtraHours.bind(null, shiftId), undefined);
  const ref = useResetOnOk(state);
  const options = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360];
  const label = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <select name="extra_minutes" className="field sm:w-56" aria-label="Extra time" required defaultValue="">
        <option value="" disabled>Extra time worked…</option>
        {options.map((m) => <option key={m} value={m}>{label(m)}</option>)}
      </select>
      <textarea name="reason" rows={2} className="field" placeholder="Why was extra time needed?" aria-label="Reason" required />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : "Request approval"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function WithdrawButton({ table, id, path }: { table: "expense_claims" | "travel_logs" | "timesheet_adjustments"; id: string; path: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-danger underline" disabled={pending}
      onClick={() => { if (confirm("Withdraw this claim?")) start(() => withdrawClaim(table, id, path)); }}>
      Withdraw
    </button>
  );
}
