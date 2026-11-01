"use client";
import { useState, useTransition } from "react";
import { approveAll, reviewClaim } from "./actions";

type Table = "expense_claims" | "travel_logs" | "timesheet_adjustments";

export function ReviewButtons({ table, id }: { table: Table; id: string }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = (status: "approved" | "rejected") => start(async () => {
    const r = await reviewClaim(table, id, status, note);
    if (r?.error) setErr(r.error);
  });
  if (rejecting) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <input className="field flex-1 py-1.5 text-sm" placeholder="Reason (shown to the worker)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        <button className="btn bg-danger px-3 py-1.5 text-white" disabled={pending} onClick={() => run("rejected")}>Reject</button>
        <button className="btn-ghost px-3 py-1.5" onClick={() => setRejecting(false)}>Cancel</button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button className="btn bg-success px-3 py-1.5 text-white" disabled={pending} onClick={() => run("approved")}>Approve</button>
      <button className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => setRejecting(true)}>Reject…</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function ApproveAllButton({ table, ids, label }: { table: Table; ids: string[]; label: string }) {
  const [pending, start] = useTransition();
  if (ids.length < 2) return null;
  return (
    <button className="btn-ghost py-1.5 text-sm" disabled={pending}
      onClick={() => { if (confirm(`Approve all ${ids.length} ${label}?`)) start(() => approveAll(table, ids)); }}>
      {pending ? "Approving…" : `Approve all ${ids.length}`}
    </button>
  );
}
