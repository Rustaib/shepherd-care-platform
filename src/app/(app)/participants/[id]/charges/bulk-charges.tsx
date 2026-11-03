import { formatDate, money } from "@/lib/ndis";
import { requireUser } from "@/lib/org";
import { ChargeForm, ChargeItem, type BulkService, type ChargeRow } from "./charge-form";

/** Bulk weekly/monthly charges (e.g. SIL) for a participant — managers only. */
export async function BulkCharges({ participantId, orgId, today }: { participantId: string; orgId: string; today: string }) {
  const { supabase } = await requireUser();
  const [{ data: charges }, { data: services }] = await Promise.all([
    supabase.from("participant_charges").select("id,service_id,description,frequency,amount,support_item_code,start_date,end_date,service:services(name,category_label,weekday_code)")
      .eq("participant_id", participantId).order("start_date", { ascending: false }),
    supabase.from("services").select("id,name,category_label,unit,weekday_code,weekday_rate").eq("organisation_id", orgId).eq("active", true).order("sort_order").order("name"),
  ]);
  const opts: BulkService[] = (services ?? [])
    .sort((a, b) => Number(b.unit === "Week" || b.unit === "Month") - Number(a.unit === "Week" || a.unit === "Month"))
    .map((s) => ({ id: s.id, label: `${s.category_label ? s.category_label + " " : ""}${s.name}${s.unit === "Week" ? " (weekly)" : s.unit === "Month" ? " (monthly)" : ""}`, unit: s.unit, code: s.weekday_code, rate: s.weekday_rate == null ? null : Number(s.weekday_rate) }));
  type Row = ChargeRow & { service: { name: string; category_label: string | null; weekday_code: string | null } | null };
  const rows = ((charges ?? []) as unknown as Row[]).map((c) => ({ ...c, amount: Number(c.amount) }));

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Bulk charges (SIL)</h2>
        <p className="text-sm text-muted">Charge an agreed amount per week (Monday–Sunday) or per calendar month instead of per shift. Each week or month goes on one invoice only; part weeks or months at the start or end are charged per day. Shifts on a weekly or monthly service aren&apos;t billed separately.</p>
      </div>
      {!!rows.length && (
        <ul className="divide-y divide-line">
          {rows.map((c) => {
            const ended = c.end_date && c.end_date < today, future = c.start_date > today;
            return (
              <ChargeItem key={c.id} participantId={participantId} charge={c} services={opts} summary={
                <>
                  <div className="font-medium">{money(c.amount)} per {c.frequency}{c.description ? ` · ${c.description}` : ""}
                    {ended ? <span className="ml-2 badge">Ended</span> : future ? <span className="ml-2 badge">Upcoming</span> : <span className="ml-2 badge bg-brand/10 text-brand">Active</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDate(c.start_date)} – {c.end_date ? formatDate(c.end_date) : "ongoing"} · {c.support_item_code || c.service?.weekday_code || "no item code"}
                    {c.service && ` · ${c.service.category_label ? c.service.category_label + " " : ""}${c.service.name}`}
                  </div>
                </>
              } />
            );
          })}
        </ul>
      )}
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-brand">+ Add a weekly or monthly charge</summary>
        <div className="mt-3"><ChargeForm participantId={participantId} services={opts} /></div>
      </details>
    </section>
  );
}
