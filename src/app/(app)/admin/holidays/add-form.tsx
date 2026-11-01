"use client";
import { useActionState } from "react";
import { addHoliday } from "./actions";

export function AddHolidayForm() {
  const [state, action, pending] = useActionState(addHoliday, undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Add a holiday</h2>
      <p className="text-sm text-muted">For a new gazetted holiday, a local show day, or another day your organisation pays at public holiday rates.</p>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
        <input name="date" type="date" className="field" required aria-label="Date" />
        <input name="name" className="field" placeholder="Name, e.g. Royal Easter Show Day" required aria-label="Name" />
        <button className="btn-primary" disabled={pending}>Add</button>
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
