import { money, formatDate } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { PAY_CATEGORIES, PAY_LABEL } from "@/lib/payroll";
import { buildPayrollReport } from "@/lib/payroll-report";
import { addDaysLocal, isValidDate, mondayOf, todayIn } from "@/lib/time";
import { getRosterOptions } from "../../roster/options";

export const metadata = { title: "Payroll export" };

export default async function Exports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; staff?: string | string[] }> }) {
  const sp = await searchParams;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const lastMonday = addDaysLocal(mondayOf(todayIn(org.timezone)), -14);
  const from = sp.from && isValidDate(sp.from) ? sp.from : lastMonday;
  const to = sp.to && isValidDate(sp.to) && sp.to >= from ? sp.to : addDaysLocal(from, 13);
  const staffIds = ([] as string[]).concat(sp.staff ?? []).filter(Boolean);
  const [{ staff }, report] = await Promise.all([
    getRosterOptions(org.id, org.timezone),
    buildPayrollReport(supabase, org, from, to, staffIds),
  ]);
  const qs = new URLSearchParams({ from, to });
  staffIds.forEach((s) => qs.append("staff", s));
  const fmt = (n: number) => (n ? n.toFixed(2) : "–");
  const warnings = report.rows.filter((r) => r.pendingClaims || r.notClockedOut);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Payroll export</h1>
      <form className="card grid gap-4 md:grid-cols-[160px_160px_1fr_auto] md:items-end" action="/admin/exports">
        <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" defaultValue={from} className="field" /></div>
        <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" defaultValue={to} className="field" /></div>
        <div>
          <label htmlFor="staff" className="label">Staff (leave empty for everyone; Ctrl/⌘-click for several)</label>
          <select id="staff" name="staff" multiple defaultValue={staffIds} className="field h-28">
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="btn-primary">Update</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {formatDate(from)} – {formatDate(to)} · {report.rows.length} staff
          {report.holidays.length > 0 && <> · public holidays: {report.holidays.map((h) => formatDate(h)).join(", ")}</>}
        </p>
        <a href={`/api/exports/payroll?${qs}`} className="btn-primary">⬇ Download CSV</a>
      </div>

      {warnings.length > 0 && (
        <div className="card border-accent/50 bg-accent/5 text-sm">
          <strong>Check before running payroll:</strong>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={w.staffId}>{w.name}:{w.pendingClaims ? ` ${w.pendingClaims} claim${w.pendingClaims > 1 ? "s" : ""} awaiting approval` : ""}{w.pendingClaims && w.notClockedOut ? ";" : ""}{w.notClockedOut ? ` ${w.notClockedOut} shift${w.notClockedOut > 1 ? "s" : ""} not clocked out (rostered times used)` : ""}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">Staff member</th><th className="p-3 text-right">Shifts</th>
              {PAY_CATEGORIES.map((c) => <th key={c} className="p-3 text-right">{PAY_LABEL[c]}</th>)}
              <th className="p-3 text-right">Total hrs</th><th className="p-3 text-right">Km</th><th className="p-3 text-right">Expenses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {report.rows.map((r) => (
              <tr key={r.staffId}>
                <td className="p-3 font-medium">{r.name}</td><td className="p-3 text-right">{r.shifts}</td>
                {PAY_CATEGORIES.map((c) => <td key={c} className="p-3 text-right">{fmt(r.buckets[c])}</td>)}
                <td className="p-3 text-right font-semibold">{r.total.toFixed(2)}</td>
                <td className="p-3 text-right">{r.km ? r.km.toFixed(1) : "–"}</td>
                <td className="p-3 text-right">{r.expenses ? money(r.expenses) : "–"}</td>
              </tr>
            ))}
            {!report.rows.length && <tr><td colSpan={11} className="p-6 text-center text-muted">No worked shifts in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Hours use rostered times plus approved extra time, less unpaid breaks, for shifts that have finished. Weekend and public holiday
        hours are split at midnight; weekday hours are classed by shift (evening = finishes after 8pm, night = finishes after midnight or
        starts before 6am), following the SCHADS Award structure. Only approved kilometres and expenses are included. Confirm treatment of
        sleepovers and overtime with your payroll provider.
      </p>
    </div>
  );
}
