"use client";
import { useActionState, useState, useTransition } from "react";
import { deleteInvoice, regeneratePdf, sendInvoice, setInvoiceStatus, voidInvoice } from "../actions";

function Msg({ s }: { s?: { error?: string; ok?: string } }) {
  if (!s) return null;
  return s.error ? <p role="alert" className="text-sm text-danger">{s.error}</p> : <p role="status" className="text-sm text-success">{s.ok}</p>;
}

export function SendForm({ id, to, subject, body, sentBefore }: { id: string; to: string; subject: string; body: string; sentBefore: boolean }) {
  const [state, action, pending] = useActionState(sendInvoice.bind(null, id), undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="font-semibold">{sentBefore ? "Send again" : "Email this invoice"}</h2>
      <div>
        <label htmlFor="to" className="label">To</label>
        <input id="to" name="to" className="field" defaultValue={to} placeholder="coordinator@example.com, plans@example.com" />
        <p className="mt-1 text-xs text-muted">Separate several addresses with commas.</p>
      </div>
      <div>
        <label htmlFor="cc" className="label">Cc <span className="font-normal text-muted">(optional)</span></label>
        <input id="cc" name="cc" className="field" />
      </div>
      <div>
        <label htmlFor="subject" className="label">Subject</label>
        <input id="subject" name="subject" className="field" defaultValue={subject} />
      </div>
      <div>
        <label htmlFor="body" className="label">Message</label>
        <textarea id="body" name="body" rows={11} className="field" defaultValue={body} />
      </div>
      <p className="text-xs text-muted">The invoice PDF is attached. Replies go to your invoice email address (Invoice template settings).</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : "Send invoice"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function StatusActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [voiding, setVoiding] = useState(false);
  const [vstate, vaction, vpending] = useActionState(voidInvoice.bind(null, id), undefined);
  if (status === "void") return null;
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Status</h2>
      <div className="flex flex-wrap items-center gap-2">
        {status === "generated" && (
          <button className="btn-ghost" disabled={pending} onClick={() => start(() => setInvoiceStatus(id, "sent"))}>Mark as sent</button>
        )}
        {status !== "paid" ? (
          <span className="flex flex-wrap items-center gap-2">
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="field w-auto py-1.5" aria-label="Paid on" />
            <button className="btn bg-success text-white" disabled={pending} onClick={() => start(() => setInvoiceStatus(id, "paid", paidOn))}>Mark as paid</button>
          </span>
        ) : (
          <button className="btn-ghost" disabled={pending} onClick={() => start(() => setInvoiceStatus(id, "sent"))}>Mark as unpaid</button>
        )}
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => regeneratePdf(id))}>Rebuild PDF</button>
        {status === "generated" ? (
          <button className="btn-ghost text-danger" disabled={pending}
            onClick={() => { if (confirm("Delete this invoice? Its shifts can be invoiced again.")) start(() => deleteInvoice(id)); }}>Delete</button>
        ) : (
          <button className="btn-ghost text-danger" onClick={() => setVoiding((v) => !v)}>Void…</button>
        )}
      </div>
      <p className="text-xs text-muted">&quot;Rebuild PDF&quot; applies your latest template and logo. Lines and totals don&apos;t change.</p>
      {voiding && (
        <form action={vaction} className="flex flex-wrap items-center gap-2">
          <input name="reason" className="field flex-1" placeholder="Reason, e.g. wrong rate — replaced by #10682790" />
          <button className="btn bg-danger text-white" disabled={vpending}>Void invoice</button>
        </form>
      )}
      <Msg s={vstate} />
    </div>
  );
}
