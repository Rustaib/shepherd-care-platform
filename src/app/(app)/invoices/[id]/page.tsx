import Link from "next/link";
import { notFound } from "next/navigation";
import { auDate, defaultRecipients, fillTemplate, getInvoiceSettings, INVOICE_STATUS, periodLabel, type BillTo } from "@/lib/invoicing";
import { money } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";
import { SendForm, StatusActions } from "./invoice-actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const [{ data: inv }, { data: lines }, settings] = await Promise.all([
    supabase.from("invoices").select("*, sender:profiles!invoices_sent_by_fkey(full_name)").eq("id", id).eq("organisation_id", org.id).maybeSingle(),
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("sort_order"),
    getInvoiceSettings(supabase, org.id),
  ]);
  if (!inv) notFound();
  const b = inv.bill_to as BillTo;
  const st = INVOICE_STATUS[inv.status];
  const when = (iso: string) => `${dayLabel(utcToLocal(iso, org.timezone).date)} ${timeLabel(iso, org.timezone)}`;

  return (
    <div className="space-y-5">
      <Link href="/invoices" className="text-sm text-muted hover:text-ink">← Invoices</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{settings.title} #{inv.invoice_number}</h1>
        <span className={`badge ${st.cls}`}>{st.label}</span>
        <div className="ml-auto flex gap-2">
          <a href={`/api/invoices/${id}/pdf?view=1`} target="_blank" rel="noreferrer" className="btn-ghost">View PDF</a>
          <a href={`/api/invoices/${id}/pdf`} className="btn-primary">Download PDF</a>
        </div>
      </div>

      <section className="card grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Participant</p>
          <Link href={`/participants/${inv.participant_id}`} className="font-medium text-brand underline">{b.name}</Link>
          {b.ndis_number && <p className="text-muted">NDIS {b.ndis_number}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Period</p>
          <p>{periodLabel(inv.period_start, inv.period_end)}</p>
          <p className="text-muted">Issued {auDate(inv.issue_date)} · due {auDate(inv.due_date)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Total</p>
          <p className="text-xl font-bold tabular-nums">{money(inv.total)}</p>
        </div>
        <div className="space-y-0.5 text-muted sm:col-span-3">
          <p>Generated {when(inv.created_at)}</p>
          {inv.sent_at && <p>Sent {when(inv.sent_at)}{inv.sender?.full_name ? ` by ${inv.sender.full_name}` : ""} to {(inv.sent_to ?? []).join(", ")}</p>}
          {inv.paid_at && <p>Paid {auDate(inv.paid_at)}</p>}
          {inv.status === "void" && <p className="text-danger">Void: {inv.void_reason}</p>}
        </div>
      </section>

      {inv.status !== "void" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <SendForm id={id} sentBefore={!!inv.sent_at}
            to={defaultRecipients(b).join(", ")}
            subject={fillTemplate(settings.email_subject, inv, settings, org.name)}
            body={fillTemplate(settings.email_body, inv, settings, org.name)} />
          <StatusActions id={id} status={inv.status} />
        </div>
      )}

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="p-3">Description</th><th className="p-3">Type</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Cost</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(lines ?? []).map((l) => (
              <tr key={l.id}>
                <td className="p-3">{l.description}</td><td className="p-3">{l.unit}</td>
                <td className="p-3 text-right tabular-nums">{Number(l.quantity).toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums">{money(l.unit_price)}</td>
                <td className="p-3 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line font-semibold">
            <tr><td className="p-3" colSpan={4}>Total</td><td className="p-3 text-right tabular-nums">{money(inv.total)}</td></tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
