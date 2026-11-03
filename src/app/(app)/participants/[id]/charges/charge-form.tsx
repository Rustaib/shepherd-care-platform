"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteCharge, saveCharge, type ChargeState } from "./actions";

export type ChargeRow = {
  id: string; service_id: string | null; description: string | null; frequency: "week" | "month"; amount: number;
  support_item_code: string | null; start_date: string; end_date: string | null;
};
export type BulkService = { id: string; label: string; unit: string; code: string | null; rate: number | null };

export function ChargeForm({ participantId, charge, services, onDone }: { participantId: string; charge?: ChargeRow; services: BulkService[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ChargeState, FormData>(saveCharge.bind(null, participantId, charge?.id ?? null), undefined);
  const [del, setDel] = useState<ChargeState>();
  const [deleting, startDelete] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const amount = useRef<HTMLInputElement>(null);
  const freq = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (state?.ok) { if (!charge) form.current?.reset(); onDone?.(); } }, [state, charge, onDone]);

  const pick = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    if (freq.current && (s.unit === "Week" || s.unit === "Month")) freq.current.value = s.unit === "Week" ? "week" : "month";
    if (amount.current && !amount.current.value && s.rate) amount.current.value = String(s.rate);
  };
  const id = (k: string) => `${charge?.id ?? "new"}-${k}`;
  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={id("svc")} className="label">Service</label>
          <select id={id("svc")} name="service_id" className="field" defaultValue={charge?.service_id ?? ""} onChange={(e) => pick(e.target.value)}>
            <option value="">— None (enter item code) —</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div><label htmlFor={id("desc")} className="label">Description on invoice</label>
          <input id={id("desc")} name="description" className="field" defaultValue={charge?.description ?? ""} placeholder="e.g. SIL – shared 1:3" maxLength={120} /></div>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div><label htmlFor={id("amt")} className="label">Amount ($) *</label>
            <input ref={amount} id={id("amt")} name="amount" inputMode="decimal" className="field text-right tabular-nums" defaultValue={charge?.amount ?? ""} required /></div>
          <div><label htmlFor={id("freq")} className="label">Per</label>
            <select ref={freq} id={id("freq")} name="frequency" className="field" defaultValue={charge?.frequency ?? "week"}><option value="week">Week</option><option value="month">Month</option></select></div>
        </div>
        <div><label htmlFor={id("code")} className="label">NDIS item code</label>
          <input id={id("code")} name="support_item_code" className="field font-mono" defaultValue={charge?.support_item_code ?? ""} placeholder="From the service" /></div>
        <div><label htmlFor={id("start")} className="label">Starts *</label>
          <input id={id("start")} type="date" name="start_date" className="field" defaultValue={charge?.start_date ?? ""} required /></div>
        <div><label htmlFor={id("end")} className="label">Ends</label>
          <input id={id("end")} type="date" name="end_date" className="field" defaultValue={charge?.end_date ?? ""} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : charge ? "Save" : "Add charge"}</button>
        {charge && (
          <button type="button" className="btn-ghost text-danger" disabled={deleting}
            onClick={() => startDelete(async () => { const r = await deleteCharge(participantId, charge.id); setDel(r); if (r?.ok) onDone?.(); })}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
        {(state?.error || del?.error) && <p role="alert" className="text-sm text-danger">{state?.error ?? del?.error}</p>}
      </div>
    </form>
  );
}

export function ChargeItem({ participantId, charge, services, summary }: { participantId: string; charge: ChargeRow; services: BulkService[]; summary: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{summary}</div>
        <button type="button" className="text-sm text-brand underline" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</button>
      </div>
      {open && <div className="mt-3"><ChargeForm participantId={participantId} charge={charge} services={services} onDone={() => setOpen(false)} /></div>}
    </li>
  );
}
