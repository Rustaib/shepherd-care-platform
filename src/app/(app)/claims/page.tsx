import Link from "next/link";
import { CLAIM_STATUS, expenseLabel } from "@/lib/claims";
import { money, formatDate } from "@/lib/ndis";
import { requireMembership, requireUser } from "@/lib/org";
import { WithdrawButton } from "../shifts/shift-client";

export const metadata = { title: "My claims" };

const Status = ({ s }: { s: string }) => <span className={`badge ${CLAIM_STATUS[s]?.cls ?? ""}`}>{CLAIM_STATUS[s]?.label ?? s}</span>;

export default async function MyClaims() {
  const { organisation: org } = await requireMembership();
  const { supabase, user } = await requireUser();
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: expenses }, { data: km }, { data: extra }] = await Promise.all([
    supabase.from("expense_claims").select("id,shift_id,incurred_on,category,amount,description,status,review_notes")
      .eq("organisation_id", org.id).eq("staff_user_id", user.id).gte("created_at", since).order("incurred_on", { ascending: false }),
    supabase.from("travel_logs").select("id,shift_id,travelled_on,kilometres,purpose,status")
      .eq("organisation_id", org.id).eq("staff_user_id", user.id).gte("created_at", since).order("travelled_on", { ascending: false }),
    supabase.from("timesheet_adjustments").select("id,shift_id,extra_minutes,reason,status,review_notes,created_at")
      .eq("organisation_id", org.id).eq("staff_user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }),
  ]);
  const pendingKm = (km ?? []).filter((k) => k.status !== "rejected").reduce((t, k) => t + Number(k.kilometres), 0);
  const pendingExp = (expenses ?? []).filter((e) => e.status !== "rejected").reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My claims</h1>
      <p className="text-sm text-muted">Last 90 days. Add claims from the shift they belong to.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="card"><div className="text-2xl font-bold tabular-nums">{money(pendingExp)}</div><div className="text-sm text-muted">Expenses claimed</div></div>
        <div className="card"><div className="text-2xl font-bold tabular-nums">{pendingKm.toFixed(1)} km</div><div className="text-sm text-muted">Kilometres logged</div></div>
      </div>

      {[
        { title: "Expenses", rows: (expenses ?? []).map((e) => ({ id: e.id, shift: e.shift_id, date: e.incurred_on, main: money(e.amount), sub: `${expenseLabel(e.category)} — ${e.description}`, status: e.status, note: e.review_notes, table: "expense_claims" as const })) },
        { title: "Kilometres", rows: (km ?? []).map((k) => ({ id: k.id, shift: k.shift_id, date: k.travelled_on, main: `${Number(k.kilometres)} km`, sub: k.purpose ?? "", status: k.status, note: null, table: "travel_logs" as const })) },
        { title: "Extra hours", rows: (extra ?? []).map((x) => ({ id: x.id, shift: x.shift_id, date: x.created_at.slice(0, 10), main: `+${x.extra_minutes} min`, sub: x.reason, status: x.status, note: x.review_notes, table: "timesheet_adjustments" as const })) },
      ].map((group) => (
        <section key={group.title} className="card">
          <h2 className="mb-2 font-semibold">{group.title}</h2>
          {!group.rows.length ? <p className="text-sm text-muted">None.</p> : (
            <ul className="divide-y divide-line">
              {group.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="w-24 text-muted">{formatDate(r.date)}</span>
                  <span className="font-medium tabular-nums">{r.main}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{r.sub}</span>
                  <Status s={r.status} />
                  {r.status === "pending" && <WithdrawButton table={r.table} id={r.id} path="/claims" />}
                  {r.shift && <Link href={`/shifts/${r.shift}`} className="text-xs text-brand underline">Shift</Link>}
                  {r.note && <span className="w-full pl-24 text-xs text-muted">Manager note: {r.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
