import Link from "next/link";
import { INVOICE_STATUS, periodLabel } from "@/lib/invoicing";
import { displayName, formatDate, money } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";

export const metadata = { title: "Invoices" };

type Row = {
  id: string; invoice_number: string; period_start: string; period_end: string; issue_date: string; due_date: string;
  status: string; total: number; sent_at: string | null; paid_at: string | null;
  participant: { first_name: string; last_name: string; preferred_name: string | null } | null;
};

const TABS = [
  ["open", "Not paid"], ["generated", "Generated"], ["sent", "Sent"], ["paid", "Paid"], ["void", "Void"], ["all", "All"],
] as const;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ status?: string; participant?: string; created?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();

  let q = supabase.from("invoices")
    .select("id,invoice_number,period_start,period_end,issue_date,due_date,status,total,sent_at,paid_at,participant:participants(first_name,last_name,preferred_name)")
    .eq("organisation_id", org.id).order("issue_date", { ascending: false }).order("invoice_number", { ascending: false }).limit(300);
  if (status === "open") q = q.in("status", ["generated", "sent"]);
  else if (status !== "all") q = q.eq("status", status);
  if (sp.participant) q = q.eq("participant_id", sp.participant);
  if (sp.q?.trim()) q = q.ilike("invoice_number", `%${sp.q.trim().replace(/[%_]/g, "")}%`);
  const [{ data: rows }, { data: people }] = await Promise.all([
    q.returns<Row[]>(),
    supabase.from("participants").select("id,first_name,last_name,preferred_name").eq("organisation_id", org.id).neq("status", "archived").order("last_name"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const outstanding = (rows ?? []).filter((r) => r.status === "generated" || r.status === "sent").reduce((t, r) => t + Number(r.total), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/invoices/export" className="btn-ghost">Export for accounting</Link>
          <Link href="/invoices/new" className="btn-primary">+ Generate invoices</Link>
        </div>
      </div>
      {sp.created && <div className="card border-success/40 bg-success/5 text-sm">{sp.created} invoice{sp.created === "1" ? "" : "s"} generated. Open one to download or email it.</div>}

      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map(([v, l]) => (
          <Link key={v} href={`/invoices?status=${v}${sp.participant ? `&participant=${sp.participant}` : ""}`}
            className={`rounded-full px-3 py-1.5 ${status === v ? "bg-brand text-brand-fg" : "border border-line bg-card text-muted"}`}>{l}</Link>
        ))}
      </nav>
      <form className="flex flex-col gap-2 sm:flex-row" action="/invoices">
        <input type="hidden" name="status" value={status} />
        <select name="participant" defaultValue={sp.participant ?? ""} className="field sm:w-64" aria-label="Participant">
          <option value="">All participants</option>
          {(people ?? []).map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
        </select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Invoice number" className="field sm:w-48" aria-label="Invoice number" />
        <button className="btn-ghost">Filter</button>
      </form>

      {status === "open" && outstanding > 0 && <p className="text-sm text-muted">Outstanding: <strong className="text-ink">{money(outstanding)}</strong></p>}

      {!rows?.length ? <p className="card text-sm text-muted">No invoices here yet.</p> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="p-3">Invoice</th><th className="p-3">Participant</th><th className="p-3">Period</th><th className="p-3">Due</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const overdue = r.status !== "paid" && r.status !== "void" && r.due_date < today;
                return (
                  <tr key={r.id} className="hover:bg-surface">
                    <td className="p-3 font-medium"><Link href={`/invoices/${r.id}`} className="text-brand underline">#{r.invoice_number}</Link></td>
                    <td className="p-3">{r.participant ? displayName(r.participant) : "—"}</td>
                    <td className="p-3 whitespace-nowrap">{periodLabel(r.period_start, r.period_end)}</td>
                    <td className={`p-3 whitespace-nowrap ${overdue ? "font-semibold text-danger" : ""}`}>{formatDate(r.due_date)}{overdue && " · overdue"}</td>
                    <td className="p-3 text-right tabular-nums">{money(r.total)}</td>
                    <td className="p-3"><span className={`badge ${INVOICE_STATUS[r.status].cls}`}>{INVOICE_STATUS[r.status].label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
