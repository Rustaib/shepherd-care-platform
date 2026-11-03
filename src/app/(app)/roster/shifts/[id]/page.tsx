import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { requireManager, requireUser } from "@/lib/org";
import { mondayOf, timeLabel, utcToLocal } from "@/lib/time";
import { shiftAppointments } from "@/lib/appointments";
import { cancelShift, deleteShift, saveShift } from "../../actions";
import { getRosterOptions } from "../../options";
import { ShiftForm } from "../../shift-form";

export const metadata = { title: "Edit shift" };

export default async function EditShift({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const [{ data: s }, options] = await Promise.all([
    supabase.from("shifts").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle(),
    getRosterOptions(org.id, org.timezone),
  ]);
  if (!s) notFound();

  const st = utcToLocal(s.starts_at, org.timezone), en = utcToLocal(s.ends_at, org.timezone);
  const appts = await shiftAppointments(supabase, s);
  const week = mondayOf(st.date);
  const locked = ["in_progress", "completed"].includes(s.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/roster?week=${week}`} className="text-sm text-muted hover:text-ink">← Roster</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Edit shift</h1>
        <span className="badge capitalize">{s.status.replace("_", " ")}</span>
      </div>
      {s.status === "cancelled" && <div className="card text-sm text-muted">This shift is cancelled. Saving will restore it with the status you choose.</div>}
      {s.clock_in_at && (
        <div className="card text-sm">
          Clocked in {utcToLocal(s.clock_in_at, org.timezone).time}
          {s.clock_out_at && <> · clocked out {utcToLocal(s.clock_out_at, org.timezone).time}</>}
        </div>
      )}
      {s.participant_id && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Appointments on this shift</h2>
            <Link href={`/roster/appointments/new?shift=${id}`} className="btn-ghost">+ Add appointment</Link>
          </div>
          {!appts.length ? (
            <p className="text-sm text-muted">None. Appointments for this participant during the shift, or linked to it, appear here and in the worker&apos;s reminders.</p>
          ) : (
            <ul className="divide-y divide-line">
              {appts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="w-16 font-medium tabular-nums">{timeLabel(a.starts_at, org.timezone)}</span>
                  <span className="min-w-0 flex-1">{a.title}{a.location ? <span className="text-muted"> · {a.location}</span> : null}</span>
                  {a.shift_id === id ? <span className="badge">Linked</span> : <span className="badge">During shift</span>}
                  <Link href={`/roster/appointments/${a.id}`} className="text-brand underline">Edit</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <ShiftForm action={saveShift.bind(null, id)} isNew={false} locked={locked} cancelHref={`/roster?week=${week}`}
        staff={options.staff} participants={options.participants} services={options.services}
        defaults={{ ...s, date: st.date, start: st.time, end: en.time, charge_rate: s.charge_rate === null ? null : Number(s.charge_rate) }} />
      {!locked && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-6">
          {s.status !== "cancelled" && (
            <form action={cancelShift.bind(null, id, week)}>
              <ConfirmButton className="btn-ghost" message="Cancel this shift? The worker will no longer see it as upcoming.">Cancel shift</ConfirmButton>
            </form>
          )}
          {(s.status === "draft" || s.status === "cancelled") && (
            <form action={deleteShift.bind(null, id, week)}>
              <ConfirmButton className="btn-ghost text-danger" message="Delete this shift permanently?">Delete</ConfirmButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
