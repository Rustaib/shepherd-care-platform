import Link from "next/link";
import { categoryByValue, INCIDENT_STATUS, notifyDeadline } from "@/lib/incidents";
import { displayName } from "@/lib/ndis";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";

export const metadata = { title: "Incidents" };

type Row = {
  id: string; occurred_at: string; created_at: string; category: string; severity: string; status: string;
  is_reportable: boolean; commission_notified_at: string | null;
  participant: { first_name: string; last_name: string; preferred_name: string | null } | null;
  reporter: { full_name: string } | null;
};

export default async function Incidents({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "active" } = await searchParams;
  const { role, organisation: org } = await requireMembership();
  const { supabase } = await requireUser();
  const manager = isManager(role);
  let q = supabase.from("incident_reports")
    .select("id,occurred_at,created_at,category,severity,status,is_reportable,commission_notified_at,participant:participants(first_name,last_name,preferred_name),reporter:profiles!incident_reports_reported_by_fkey(full_name)")
    .eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(200);
  if (status === "active") q = q.in("status", ["open", "under_review"]);
  else if (status !== "all") q = q.eq("status", status);
  const { data } = await q.returns<Row[]>();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{manager ? "Incident register" : "My incident reports"}</h1>
        <Link href="/incidents/new" className="btn bg-danger text-white">⚠ Report incident</Link>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm">
        {[["active", "Needs attention"], ["reported_to_commission", "Reported"], ["closed", "Closed"], ["all", "All"]].map(([v, l]) => (
          <Link key={v} href={`/incidents?status=${v}`} className={`rounded-full px-3 py-1.5 ${status === v ? "bg-brand text-brand-fg" : "bg-card text-muted border border-line"}`}>{l}</Link>
        ))}
      </nav>
      {!data?.length ? <p className="card text-sm text-muted">No incidents here.</p> : (
        <ul className="space-y-2">
          {data.map((i) => {
            const deadline = i.is_reportable && !i.commission_notified_at ? notifyDeadline(i.category, i.created_at) : null;
            const overdue = deadline && deadline.getTime() < Date.now();
            return (
              <li key={i.id}>
                <Link href={`/incidents/${i.id}`} className="card flex flex-wrap items-center gap-3 p-4 transition hover:border-brand">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{categoryByValue(i.category)?.label ?? i.category}</div>
                    <div className="text-sm text-muted">
                      {dayLabel(utcToLocal(i.occurred_at, org.timezone).date)} {timeLabel(i.occurred_at, org.timezone)}
                      {i.participant && ` · ${displayName(i.participant)}`}{manager && i.reporter && ` · by ${i.reporter.full_name}`}
                    </div>
                  </div>
                  {i.is_reportable && <span className="badge bg-danger/10 text-danger">Reportable</span>}
                  {deadline && manager && (
                    <span className={`badge ${overdue ? "bg-danger text-white" : "bg-accent/15 text-ink"}`}>
                      {overdue ? "Notification overdue" : `Notify by ${dayLabel(utcToLocal(deadline.toISOString(), org.timezone).date)} ${timeLabel(deadline.toISOString(), org.timezone)}`}
                    </span>
                  )}
                  <span className={`badge ${INCIDENT_STATUS[i.status].cls}`}>{INCIDENT_STATUS[i.status].label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
