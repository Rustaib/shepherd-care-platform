"use client";
import { useActionState } from "react";
import { generateInvoices } from "../actions";

export function GenerateForm({ from, to, issue, participants, count }: { from: string; to: string; issue: string; participants: string[]; count: number }) {
  const [state, action, pending] = useActionState(generateInvoices, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      {participants.map((p) => <input key={p} type="hidden" name="participant" value={p} />)}
      <div>
        <label htmlFor="issue_date" className="label">Issue date</label>
        <input id="issue_date" name="issue_date" type="date" defaultValue={issue} className="field" />
      </div>
      <button className="btn-primary" disabled={pending || !count}>{pending ? "Generating…" : `Generate ${count} invoice${count === 1 ? "" : "s"}`}</button>
      {state?.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
