import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryByValue, INCIDENT_STATUS, notifyDeadline } from "@/lib/incidents";
import { displayName } from "@/lib/ndis";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Incident" };

export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const { role, organisation: org } = await requireMembership();
  const { supabase } = await requireUser();
  const tz = org.timezone;
  const { data: i } = await supabase.from("incident_reports")
    .select("*, participant:participants(id,first_name,last_name,preferred_name), reporter:profiles!incident_reports_reported_by_fkey(full_name,email)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!i) notFound();
  const cat = categoryByValue(i.category);
  const deadline = i.is_reportable ? notifyDeadline(i.category, i.created_at) : null;
  const when = (iso: string) => `${dayLabel(utcToLocal(iso, tz).date)} ${timeLabel(iso, tz)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/incidents" className="text-sm text-muted hover:text-ink">← Incidents</Link>
      {submitted && <div className="card border-success/40 bg-success/5 text-sm">Thank you — your report has been submitted{i.is_reportable ? " and managers have been alerted" : ""}.</div>}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{cat?.label ?? i.category}</h1>
        <span className={`badge ${INCIDENT_STATUS[i.status].cls}`}>{INCIDENT_STATUS[i.status].label}</span>
        {i.is_reportable && <span className="badge bg-danger/10 text-danger">Reportable</span>}
        <span className="badge capitalize">{i.severity} severity</span>
      </header>
      {deadline && isManager(role) && (
        <div className={`card text-sm ${i.commission_notified_at ? "" : "border-danger/40 bg-danger/5"}`}>
          {i.commission_notified_at
            ? <>NDIS Commission notified {when(i.commission_notified_at)}.</>
            : <><strong>Notify the NDIS Commission by {when(deadline.toISOString())}</strong> via the Commission portal, then record it below.</>}
        </div>
      )}
      <section className="card">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
          <dt className="text-muted">Occurred</dt><dd>{when(i.occurred_at)}</dd>
          <dt className="text-muted">Reported</dt><dd>{when(i.created_at)} by {i.reporter?.full_name || i.reporter?.email}</dd>
          <dt className="text-muted">Participant</dt><dd>{i.participant ? <Link className="text-brand underline" href={`/participants/${i.participant.id}`}>{displayName(i.participant)}</Link> : "—"}</dd>
          <dt className="text-muted">Location</dt><dd>{i.location || "—"}</dd>
          {i.shift_id && (<><dt className="text-muted">Shift</dt><dd><Link className="text-brand underline" href={`/shifts/${i.shift_id}`}>View shift</Link></dd></>)}
        </dl>
      </section>
      <section className="card space-y-4 text-sm">
        <div><h2 className="mb-1 font-semibold">What happened</h2><p className="whitespace-pre-wrap">{i.description}</p></div>
        <div><h2 className="mb-1 font-semibold">Immediate action</h2><p className="whitespace-pre-wrap">{i.immediate_action || "—"}</p></div>
        <div><h2 className="mb-1 font-semibold">Witnesses</h2><p className="whitespace-pre-wrap">{i.witnesses || "—"}</p></div>
      </section>
      {isManager(role) ? (
        <ReviewForm id={id} status={i.status} notes={i.review_notes} reportable={i.is_reportable} notified={!!i.commission_notified_at} />
      ) : i.review_notes ? (
        <section className="card text-sm"><h2 className="mb-1 font-semibold">Manager notes</h2><p className="whitespace-pre-wrap">{i.review_notes}</p></section>
      ) : null}
    </div>
  );
}
