"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { ServiceState } from "./actions";

const BANDS = [
  ["weekday", "Weekday daytime", "Starts 6am or later, finishes by 8pm"],
  ["evening", "Weekday evening", "Finishes after 8pm, by midnight"],
  ["night", "Weekday night", "Finishes after midnight, or starts before 6am"],
  ["saturday", "Saturday", ""],
  ["sunday", "Sunday", ""],
  ["public_holiday", "Public holiday", "Uses your public holiday calendar"],
] as const;

type S = Record<string, string | number | boolean | null>;

export function ServiceForm({ action, service }: { action: (s: ServiceState, f: FormData) => Promise<ServiceState>; service: S }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = (k: string) => (service[k] == null ? "" : String(service[k]));
  return (
    <form action={formAction} className="space-y-5">
      <section className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-[100px_1fr_140px]">
          <div><label htmlFor="category_label" className="label">Category</label><input id="category_label" name="category_label" className="field" defaultValue={v("category_label")} placeholder="01" /></div>
          <div><label htmlFor="name" className="label">Service name *</label><input id="name" name="name" className="field" defaultValue={v("name")} placeholder="Assistance With Self Care Activities Standard" required /></div>
          <div><label htmlFor="unit" className="label">Charged per</label>
            <select id="unit" name="unit" className="field" defaultValue={v("unit") || "Hours"}><option value="Hours">Hour</option><option value="Each">Shift (fixed)</option></select>
          </div>
        </div>
        <p className="text-xs text-muted">Shown on invoice lines as &quot;[{v("category_label") || "01"} {v("name") || "Service name"}]&quot;.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">NDIS items and rates</h2>
        <p className="text-sm text-muted">Hours are split by time of day the same way as payroll. Check codes and price limits against the current NDIS Pricing Arrangements. A fixed-price service uses the weekday row only.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-2">When</th><th className="py-2">Support item code</th><th className="py-2">Rate ($)</th></tr></thead>
            <tbody>
              {BANDS.map(([k, label, hint]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-2 pr-3"><div className="font-medium">{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</td>
                  <td className="py-2 pr-3"><input name={`${k}_code`} aria-label={`${label} item code`} className="field font-mono" defaultValue={v(`${k}_code`)} placeholder={k === "weekday" ? "e.g. 01_011_0107_1_1" : "Not offered"} /></td>
                  <td className="py-2"><input name={`${k}_rate`} aria-label={`${label} rate`} inputMode="decimal" className="field w-32 text-right tabular-nums" defaultValue={v(`${k}_rate`)} /></td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <td className="py-2 pr-3"><div className="font-medium">Provider travel</div><div className="text-xs text-muted">Approved km × rate per km</div></td>
                <td className="py-2 pr-3"><input name="travel_code" aria-label="Travel item code" className="field font-mono" defaultValue={v("travel_code")} placeholder="e.g. 01_799_0107_1_1" /></td>
                <td className="py-2"><input name="travel_rate" aria-label="Rate per km" inputMode="decimal" className="field w-32 text-right tabular-nums" defaultValue={v("travel_rate")} placeholder="Template rate" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={service.active !== false} /> Available when rostering</label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save service"}</button>
        <Link href="/admin/services" className="btn-ghost">Cancel</Link>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
