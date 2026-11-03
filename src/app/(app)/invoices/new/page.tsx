import Link from "next/link";
import { billableFor, getInvoiceSettings, INVOICE_STATUS, periodLabel } from "@/lib/invoicing";
import { totals } from "@/lib/invoice-lines";
import { displayName, money } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { addDaysLocal, isValidDate, mondayOf, todayIn } from "@/lib/time";
import { GenerateForm } from "./generate-button";

export const metadata = { title: "Generate invoices" };

export default async function NewInvoices({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; p?: string | string[]; preview?: string }> }) {
  const sp = await searchParams;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const today = todayIn(org.timezone);
  const lastMonday = addDaysLocal(mondayOf(today), -7);
  const from = sp.from && isValidDate(sp.from) ? sp.from : lastMonday;
  const to = sp.to && isValidDate(sp.to) && sp.to >= from ? sp.to : addDaysLocal(from, 6);
  const chosen = ([] as string[]).concat(sp.p ?? []);

  const { data: people } = await supabase.from("participants").select("id,first_name,last_name,preferred_name")
    .eq("organisation_id", org.id).eq("status", "active").order("last_name");
  const settings = await getInvoiceSettings(supabase, org.id);
  const preview = sp.preview ? await billableFor(supabase, org, chosen.length ? chosen : (people ?? []).map((p) => p.id), from, to, settings) : null;
  const ready = (preview ?? []).filter((b) => b.lines.length);

  return (
    <div className="space-y-5">
      <Link href="/invoices" className="text-sm text-muted hover:text-ink">← Invoices</Link>
      <h1 className="text-2xl font-bold tracking-tight">Generate invoices</h1>

      <form className="card space-y-4" action="/invoices/new">
        <input type="hidden" name="preview" value="1" />
        <div className="grid gap-4 sm:grid-cols-2 md:w-2/3">
          <div><label htmlFor="from" className="label">Supports delivered from</label><input id="from" name="from" type="date" defaultValue={from} className="field" /></div>
          <div><label htmlFor="to" className="label">To (inclusive)</label><input id="to" name="to" type="date" defaultValue={to} className="field" /></div>
        </div>
        <fieldset>
          <legend className="label">Participants <span className="font-normal text-muted">(none ticked = everyone)</span></legend>
          <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
            {(people ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="p" value={p.id} defaultChecked={chosen.includes(p.id)} /> {displayName(p)}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn-ghost">Preview</button>
      </form>

      {preview && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Preview · {periodLabel(from, to)}</h2>
            <GenerateForm from={from} to={to} issue={today} participants={ready.map((b) => b.participant.id)} count={ready.length} />
          </div>
          <p className="text-sm text-muted">Only finished shifts with a worker are billed. Shifts already on an invoice are skipped, so you can safely re-run a period.</p>
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="p-3">Participant</th><th className="p-3 text-right">Lines</th><th className="p-3 text-right">Total</th><th className="p-3">Notes</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.map((b) => (
                  <tr key={b.participant.id} className={b.lines.length ? "" : "text-muted"}>
                    <td className="p-3 font-medium">{b.participant.name}</td>
                    <td className="p-3 text-right tabular-nums">{b.lines.length}</td>
                    <td className="p-3 text-right tabular-nums">{b.lines.length ? money(totals(b.lines).total) : "—"}</td>
                    <td className="space-y-1 p-3 text-xs">
                      {b.overlapping.map((o) => (
                        <div key={o.id}>Already invoiced: <Link href={`/invoices/${o.id}`} className="text-brand underline">#{o.invoice_number}</Link> ({periodLabel(o.period_start, o.period_end)}, {INVOICE_STATUS[o.status].label})</div>
                      ))}
                      {b.alreadyBilled > 0 && <div>{b.alreadyBilled} shift line{b.alreadyBilled > 1 ? "s" : ""} skipped — already invoiced</div>}
                      {!b.lines.length && !b.problems.length && <div>Nothing to invoice</div>}
                      {b.problems.map((pr, i) => <div key={i} className="text-danger">⚠ {pr}</div>)}
                      {!b.billTo.support_coordinator_email && !b.billTo.plan_manager_email && b.lines.length > 0 && (
                        <div>No support coordinator or plan manager email — <Link href={`/participants/${b.participant.id}/edit`} className="underline">add one</Link> before sending</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.some((b) => b.problems.length) && (
            <p className="text-sm text-danger">Lines with ⚠ are left off the invoice. Fix them in <Link href="/admin/services" className="underline">Services &amp; prices</Link> or on the shift, then generate again — fixed shifts are picked up on the next run.</p>
          )}
        </section>
      )}
    </div>
  );
}
