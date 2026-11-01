"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Field } from "@/components/field";
import { MANAGEMENT_LABEL, SUPPORT_GROUPS, money } from "@/lib/ndis";
import type { PlanState } from "./actions";

type Plan = {
  start_date?: string; end_date?: string; management_type?: string; plan_manager_name?: string | null;
  plan_manager_email?: string | null; goals?: string | null; status?: string;
};

export function PlanForm({ action, plan = {}, budgets = {}, cancelHref }: {
  action: (s: PlanState, f: FormData) => Promise<PlanState>;
  plan?: Plan; budgets?: Record<string, number>; cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [mgmt, setMgmt] = useState(plan.management_type ?? "plan_managed");
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(budgets).map(([k, v]) => [k, String(v)])),
  );
  const total = useMemo(() => Object.values(amounts).reduce((s, v) => s + (Number(v.replace(/[$,\s]/g, "")) || 0), 0), [amounts]);
  const e = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Plan details</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start date *" name="start_date" type="date" defaultValue={plan.start_date} error={e.start_date} required />
          <Field label="End date *" name="end_date" type="date" defaultValue={plan.end_date} error={e.end_date} required />
          <Field label="Status" name="status">
            <select id="status" name="status" className="field" defaultValue={plan.status ?? "active"}>
              <option value="active">Active</option><option value="draft">Draft</option><option value="expired">Expired</option>
            </select>
          </Field>
          <Field label="Management" name="management_type">
            <select id="management_type" name="management_type" className="field" value={mgmt} onChange={(ev) => setMgmt(ev.target.value)}>
              {Object.entries(MANAGEMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {mgmt === "plan_managed" ? (
            <>
              <Field label="Plan manager" name="plan_manager_name" defaultValue={plan.plan_manager_name ?? ""} />
              <Field label="Plan manager email" name="plan_manager_email" type="email" defaultValue={plan.plan_manager_email ?? ""} error={e.plan_manager_email} hint="Where invoices are sent" />
            </>
          ) : (
            <><input type="hidden" name="plan_manager_name" value="" /><input type="hidden" name="plan_manager_email" value="" /></>
          )}
        </div>
        <div>
          <label htmlFor="goals" className="label">Goals</label>
          <textarea id="goals" name="goals" rows={4} className="field" defaultValue={plan.goals ?? ""}
            placeholder="The participant's NDIS goals, one per line. Staff see these when writing progress notes." />
        </div>
      </section>

      <section className="card space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Budgets your organisation delivers</h2>
          <span className="text-sm text-muted">Total <strong className="text-ink tabular-nums">{money(total)}</strong></span>
        </div>
        <p className="-mt-3 text-sm text-muted">Enter the funding allocated to you in each category. Leave blank for categories you don&apos;t provide.</p>
        {SUPPORT_GROUPS.map((g) => (
          <fieldset key={g.group} className="space-y-2">
            <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{g.group}</legend>
            {g.items.map((i) => (
              <div key={i.value} className="grid items-center gap-2 sm:grid-cols-[1fr_180px]">
                <label htmlFor={`budget_${i.value}`} className="text-sm">{i.label}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
                  <input id={`budget_${i.value}`} name={`budget_${i.value}`} inputMode="decimal"
                    className={`field pl-7 text-right tabular-nums ${e[`budget_${i.value}`] ? "border-danger" : ""}`}
                    value={amounts[i.value] ?? ""} onChange={(ev) => setAmounts((a) => ({ ...a, [i.value]: ev.target.value }))} />
                </div>
              </div>
            ))}
          </fieldset>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save plan"}</button>
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
