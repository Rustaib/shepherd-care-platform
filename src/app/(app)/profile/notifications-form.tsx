"use client";
import { useActionState } from "react";
import { saveNotifications } from "./actions";

const OPTIONS = [
  { key: "progress_notes", label: "Progress notes", hint: "Each note a worker writes, with the note text" },
  { key: "expenses", label: "Expense claims and extra hours", hint: "Each claim waiting for approval" },
  { key: "travel", label: "Kilometres", hint: "Each trip a worker logs" },
  { key: "incidents", label: "Incident reports", hint: "Reportable and high-severity incidents always reach owners and admins" },
] as const;

export function NotificationsForm({ values, orgName }: { values: Record<string, boolean>; orgName: string }) {
  const [state, action, pending] = useActionState(saveNotifications, undefined);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="font-semibold">Email notifications</h2>
        <p className="text-sm text-muted">Get an email when your team logs something at {orgName}.</p>
      </div>
      <div className="space-y-3">
        {OPTIONS.map((o) => (
          <label key={o.key} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name={o.key} defaultChecked={values[o.key]} className="mt-1 h-4 w-4" />
            <span><span className="font-medium">{o.label}</span><span className="block text-muted">{o.hint}</span></span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      </div>
    </form>
  );
}
