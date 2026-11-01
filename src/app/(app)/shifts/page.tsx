import Link from "next/link";
import { displayName } from "@/lib/ndis";
import { requireMembership, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";

export const metadata = { title: "My shifts" };

type Row = {
  id: string; starts_at: string; ends_at: string; status: string; break_minutes: number; participant_id: string | null;
  participant: { first_name: string; last_name: string; preferred_name: string | null } | null;
  progress_notes: { id: string }[];
};

export default async function MyShifts() {
  const { organisation: org } = await requireMembership();
  const { supabase, user } = await requireUser();
  const tz = org.timezone;
  const from = new Date(Date.now() - 28 * 864e5).toISOString();
  const to = new Date(Date.now() + 28 * 864e5).toISOString();
  const { data } = await supabase.from("shifts")
    .select("id,starts_at,ends_at,status,break_minutes,participant_id,participant:participants(first_name,last_name,preferred_name),progress_notes(id)")
    .eq("organisation_id", org.id).eq("staff_user_id", user.id).neq("status", "cancelled")
    .gte("starts_at", from).lte("starts_at", to).order("starts_at").returns<Row[]>();

  const now = Date.now();
  const upcoming = (data ?? []).filter((s) => Date.parse(s.ends_at) >= now);
  const past = (data ?? []).filter((s) => Date.parse(s.ends_at) < now).reverse();

  const Item = ({ s }: { s: Row }) => {
    const noteMissing = Date.parse(s.ends_at) < now && s.participant_id && !s.progress_notes.length;
    return (
      <li>
        <Link href={`/shifts/${s.id}`} className="card flex items-center gap-3 p-4 transition hover:border-brand">
          <div className="w-24 shrink-0 text-sm font-semibold">{dayLabel(utcToLocal(s.starts_at, tz).date)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{s.participant ? displayName(s.participant) : "No participant"}</div>
            <div className="text-sm text-muted tabular-nums">{timeLabel(s.starts_at, tz)} – {timeLabel(s.ends_at, tz)}</div>
          </div>
          {s.status === "in_progress" && <span className="badge bg-success/10 text-success">On shift</span>}
          {noteMissing && <span className="badge bg-danger/10 text-danger">Note needed</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My shifts</h1>
      <section className="space-y-2">
        <h2 className="font-semibold">Upcoming</h2>
        {upcoming.length ? <ul className="space-y-2">{upcoming.map((s) => <Item key={s.id} s={s} />)}</ul>
          : <p className="card text-sm text-muted">No upcoming shifts in the next 4 weeks.</p>}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Past 4 weeks</h2>
        {past.length ? <ul className="space-y-2">{past.map((s) => <Item key={s.id} s={s} />)}</ul>
          : <p className="card text-sm text-muted">No recent shifts.</p>}
      </section>
    </div>
  );
}
