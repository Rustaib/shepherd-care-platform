import Link from "next/link";
import { displayName } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { addDaysLocal, dayLabel, isValidDate, localRangeUtc, mondayOf, timeLabel, todayIn, utcToLocal } from "@/lib/time";
import { getRosterOptions } from "./options";
import { WeekActions } from "./week-actions";

export const metadata = { title: "Roster" };

type Shift = {
  id: string; starts_at: string; ends_at: string; status: string; break_minutes: number;
  participant: { first_name: string; last_name: string; preferred_name: string | null } | null;
  staff: { full_name: string; email: string } | null;
};
type Appt = {
  id: string; title: string; starts_at: string; ends_at: string | null;
  participant: { first_name: string; last_name: string; preferred_name: string | null };
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-dashed border-line bg-card text-muted",
  published: "border-brand/30 bg-brand/5",
  in_progress: "border-success/40 bg-success/10",
  completed: "border-line bg-surface",
  cancelled: "border-line bg-surface opacity-60 line-through",
};

export default async function Roster({ searchParams }: { searchParams: Promise<{ week?: string; staff?: string; participant?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const tz = org.timezone;
  const today = todayIn(tz);
  const monday = mondayOf(sp.week && isValidDate(sp.week) ? sp.week : today);
  const { start, end } = localRangeUtc(monday, 7, tz);
  const days = Array.from({ length: 7 }, (_, i) => addDaysLocal(monday, i));

  let shiftQ = supabase.from("shifts")
    .select("id,starts_at,ends_at,status,break_minutes,participant:participants(first_name,last_name,preferred_name),staff:profiles(full_name,email)")
    .eq("organisation_id", org.id).gte("starts_at", start).lt("starts_at", end).order("starts_at");
  if (sp.staff === "open") shiftQ = shiftQ.is("staff_user_id", null);
  else if (sp.staff) shiftQ = shiftQ.eq("staff_user_id", sp.staff);
  if (sp.participant) shiftQ = shiftQ.eq("participant_id", sp.participant);
  if (!sp.cancelled) shiftQ = shiftQ.neq("status", "cancelled");

  let apptQ = supabase.from("appointments")
    .select("id,title,starts_at,ends_at,participant:participants(first_name,last_name,preferred_name)")
    .eq("organisation_id", org.id).gte("starts_at", start).lt("starts_at", end).order("starts_at");
  if (sp.participant) apptQ = apptQ.eq("participant_id", sp.participant);

  const [{ data: shifts }, { data: appts }, options] = await Promise.all([
    shiftQ.returns<Shift[]>(), sp.staff ? Promise.resolve({ data: [] as Appt[] }) : apptQ.returns<Appt[]>(), getRosterOptions(org.id, tz),
  ]);

  const byDay = (date: string) => ({
    shifts: (shifts ?? []).filter((s) => utcToLocal(s.starts_at, tz).date === date),
    appts: (appts ?? []).filter((a) => utcToLocal(a.starts_at, tz).date === date),
  });
  const drafts = (shifts ?? []).filter((s) => s.status === "draft").length;
  const open = (shifts ?? []).filter((s) => !s.staff && s.status !== "cancelled").length;
  const totalHours = (shifts ?? []).filter((s) => s.status !== "cancelled")
    .reduce((h, s) => h + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 36e5 - s.break_minutes / 60, 0);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { week: monday, staff: sp.staff, participant: sp.participant, cancelled: sp.cancelled, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/roster?${p}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Roster</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/roster/appointments/new?date=${monday >= today ? monday : today}`} className="btn-ghost">+ Appointment</Link>
          <Link href={`/roster/shifts/new?date=${monday >= today ? monday : today}${sp.participant ? `&participant=${sp.participant}` : ""}`} className="btn-primary">+ Shift</Link>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <Link href={qs({ week: addDaysLocal(monday, -7) })} className="btn-ghost px-3" aria-label="Previous week">←</Link>
        <div className="min-w-40 text-center font-semibold">{dayLabel(monday)} – {dayLabel(addDaysLocal(monday, 6))}</div>
        <Link href={qs({ week: addDaysLocal(monday, 7) })} className="btn-ghost px-3" aria-label="Next week">→</Link>
        {monday !== mondayOf(today) && <Link href={qs({ week: today })} className="text-sm text-brand underline">This week</Link>}
        <form className="ml-auto flex flex-wrap gap-2" action="/roster">
          <input type="hidden" name="week" value={monday} />
          <select name="staff" defaultValue={sp.staff ?? ""} className="field py-1.5 text-sm" aria-label="Filter by worker">
            <option value="">All workers</option>
            <option value="open">Open shifts</option>
            {options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select name="participant" defaultValue={sp.participant ?? ""} className="field py-1.5 text-sm" aria-label="Filter by participant">
            <option value="">All participants</option>
            {options.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" name="cancelled" value="1" defaultChecked={!!sp.cancelled} /> Cancelled</label>
          <button className="btn-ghost py-1.5">Filter</button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {(shifts ?? []).filter((s) => s.status !== "cancelled").length} shifts · {totalHours.toFixed(1)} hours
          {open > 0 && <> · <Link href={qs({ staff: "open" })} className="font-medium text-danger underline">{open} open</Link></>}
        </p>
        <WeekActions monday={monday} drafts={drafts} />
      </div>

      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((date) => {
          const { shifts: ds, appts: da } = byDay(date);
          const isToday = date === today;
          return (
            <section key={date} className={`flex min-h-24 flex-col rounded-2xl border bg-card p-2.5 ${isToday ? "border-brand" : "border-line"}`}>
              <div className="mb-2 flex items-center justify-between px-0.5">
                <h2 className={`text-sm font-semibold ${isToday ? "text-brand" : ""}`}>{dayLabel(date)}</h2>
                <Link href={`/roster/shifts/new?date=${date}${sp.participant ? `&participant=${sp.participant}` : ""}${sp.staff && sp.staff !== "open" ? `&staff=${sp.staff}` : ""}`}
                  className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={`Add shift on ${dayLabel(date)}`}>+</Link>
              </div>
              <ul className="space-y-1.5">
                {da.map((a) => (
                  <li key={a.id}>
                    <Link href={`/roster/appointments/${a.id}`} className="block rounded-lg border border-accent/50 bg-accent/10 px-2 py-1.5 text-xs hover:border-accent">
                      <div className="font-semibold">📅 {timeLabel(a.starts_at, tz)} {a.title}</div>
                      <div className="truncate text-muted">{displayName(a.participant)}</div>
                    </Link>
                  </li>
                ))}
                {ds.map((s) => (
                  <li key={s.id}>
                    <Link href={`/roster/shifts/${s.id}`} className={`block rounded-lg border px-2 py-1.5 text-xs transition hover:border-brand ${STATUS_STYLE[s.status]}`}>
                      <div className="font-semibold tabular-nums">{timeLabel(s.starts_at, tz)}–{timeLabel(s.ends_at, tz)}{s.status === "draft" && <span className="ml-1 font-normal">(draft)</span>}</div>
                      <div className="truncate">{s.participant ? displayName(s.participant) : "No participant"}</div>
                      <div className={`truncate ${s.staff ? "text-muted" : "font-semibold text-danger"}`}>{s.staff ? (s.staff.full_name || s.staff.email) : "Open shift"}</div>
                    </Link>
                  </li>
                ))}
              </ul>
              {!ds.length && !da.length && <p className="px-0.5 text-xs text-muted lg:hidden">Nothing scheduled</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
