"use client";
import { useActionState } from "react";
import { reviewIncident } from "../actions";

export function ReviewForm({ id, status, notes, reportable, notified }: { id: string; status: string; notes: string | null; reportable: boolean; notified: boolean }) {
  const [state, action, pending] = useActionState(reviewIncident.bind(null, id), undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="font-semibold">Manager review</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" className="field" defaultValue={status}>
            <option value="open">Open</option><option value="under_review">Under review</option>
            <option value="reported_to_commission">Reported to NDIS Commission</option><option value="closed">Closed</option>
          </select>
        </div>
        <div className="space-y-2 pt-7 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="is_reportable" defaultChecked={reportable} /> Reportable incident</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="commission_notified" defaultChecked={notified} /> NDIS Commission notified</label>
        </div>
      </div>
      <div>
        <label htmlFor="review_notes" className="label">Review notes, actions and follow-up</label>
        <textarea id="review_notes" name="review_notes" rows={5} className="field" defaultValue={notes ?? ""}
          placeholder="Investigation, outcome, corrective actions, who was notified (family, guardian, police) and when." />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save review"}</button>
        {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      </div>
    </form>
  );
}
