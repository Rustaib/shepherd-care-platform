import Link from "next/link";
import { expenseLabel } from "@/lib/claims";
import { displayName, money } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";
import { ApproveAllButton, ReviewButtons } from "./review-buttons";

export const metadata = { title: "Approvals" };

type P = { first_name: string; last_name: string; preferred_name: string | null } | null;
type Shift = { id: string; starts_at: string; ends_at: string; clock_out_at: string | null; participant: P } | null;

export default async function Approvals() {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const tz = org.timezone;
  const shiftSel = "shift:shifts(id,starts_at,ends_at,clock_out_at,participant:participants(first_name,last_name,preferred_name))";
  const [{ data: extra }, { data: expenses }, { data: km }] = await Promise.all([
    supabase.from("timesheet_adjustments").select(`id,extra_minutes,reason,created_at,staff:profiles(full_name,email),${shiftSel}`)
      .eq("organisation_id", org.id).eq("status", "pending").order("created_at"),
    supabase.from("expense_claims").select(`id,category,amount,description,incurred_on,receipt_path,staff:profiles(full_name,email),${shiftSel}`)
      .eq("organisation_id", org.id).eq("status", "pending").order("created_at"),
    supabase.from("travel_logs").select(`id,kilometres,purpose,from_location,to_location,travelled_on,staff:profiles(full_name,email),${shiftSel}`)
      .eq("organisation_id", org.id).eq("status", "pending").order("created_at"),
  ]);

  // Short-lived links to receipts (private bucket)
  const receiptUrls = new Map<string, string>();
  const paths = (expenses ?? []).map((e) => e.receipt_path).filter(Boolean) as string[];
  if (paths.length) {
    const { data } = await supabase.storage.from("receipts").createSignedUrls(paths, 3600);
    data?.forEach((d) => d.path && d.signedUrl && receiptUrls.set(d.path, d.signedUrl));
  }

  const who = (s: unknown) => { const p = s as { full_name: string; email: string } | null; return p?.full_name || p?.email || "Staff"; };
  const shiftLine = (s: unknown) => {
    const sh = s as Shift;
    if (!sh) return null;
    return (
      <Link href={`/shifts/${sh.id}`} className="text-xs text-brand underline">
        {dayLabel(utcToLocal(sh.starts_at, tz).date)} {timeLabel(sh.starts_at, tz)}–{timeLabel(sh.ends_at, tz)}{sh.participant ? ` · ${displayName(sh.participant)}` : ""}
      </Link>
    );
  };
  const total = (extra?.length ?? 0) + (expenses?.length ?? 0) + (km?.length ?? 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
      {!total && <p className="card text-sm text-muted">All caught up — nothing waiting for approval. 🎉</p>}

      {!!extra?.length && (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">Extra hours ({extra.length})</h2>
          <ul className="divide-y divide-line">
            {extra.map((x) => {
              const sh = x.shift as unknown as Shift;
              const overBy = sh?.clock_out_at ? Math.round((Date.parse(sh.clock_out_at) - Date.parse(sh.ends_at)) / 60e3) : null;
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{who(x.staff)} · +{x.extra_minutes} min</div>
                    <div className="text-sm text-muted">{x.reason}</div>
                    {shiftLine(x.shift)}
                    {overBy !== null && <div className="text-xs text-muted">Clocked out {overBy > 0 ? `${overBy} min after` : overBy < 0 ? `${-overBy} min before` : "at"} rostered finish</div>}
                  </div>
                  <ReviewButtons table="timesheet_adjustments" id={x.id} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!!expenses?.length && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Expenses ({expenses.length})</h2>
            <ApproveAllButton table="expense_claims" ids={expenses.map((e) => e.id)} label="expenses" /></div>
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{who(e.staff)} · <span className="tabular-nums">{money(e.amount)}</span></div>
                  <div className="text-sm text-muted">{expenseLabel(e.category)} — {e.description}</div>
                  <div className="flex flex-wrap gap-3">
                    {shiftLine(e.shift)}
                    {e.receipt_path ? <a href={receiptUrls.get(e.receipt_path)} target="_blank" rel="noreferrer" className="text-xs text-brand underline">View receipt</a>
                      : <span className="text-xs text-danger">No receipt</span>}
                  </div>
                </div>
                <ReviewButtons table="expense_claims" id={e.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!km?.length && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Kilometres ({km.length})</h2>
            <ApproveAllButton table="travel_logs" ids={km.map((k) => k.id)} label="km logs" /></div>
          <ul className="divide-y divide-line">
            {km.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{who(k.staff)} · <span className="tabular-nums">{Number(k.kilometres)} km</span></div>
                  <div className="text-sm text-muted">{k.purpose}{k.from_location || k.to_location ? ` (${k.from_location ?? "?"} → ${k.to_location ?? "?"})` : ""}</div>
                  {shiftLine(k.shift)}
                </div>
                <ReviewButtons table="travel_logs" id={k.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
