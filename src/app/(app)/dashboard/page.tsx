import Link from "next/link";
import { PushToggle } from "@/components/push-toggle";
import { env } from "@/lib/env";
import { formatShiftRange, hoursBetween } from "@/lib/format";
import { isAdmin, isManager, requireMembership, requireUser } from "@/lib/org";

export const metadata = { title: "Home" };

type ShiftRow = {
  id: string; starts_at: string; ends_at: string; break_minutes: number; status: string; location: string | null;
  participant: { first_name: string; last_name: string; preferred_name: string | null } | null;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { supabase, user } = await requireUser();
  const { role, organisation: org } = await requireMembership();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const firstName = profile?.full_name?.split(" ")[0] || "there";
  const now = new Date();
  const nowIso = now.toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 864e5).toISOString();

  const [{ data: shifts }, { data: recent }] = await Promise.all([
    supabase.from("shifts")
      .select("id,starts_at,ends_at,break_minutes,status,location,participant:participants(first_name,last_name,preferred_name)")
      .eq("organisation_id", org.id).eq("staff_user_id", user.id).in("status", ["published", "in_progress"])
      .gte("ends_at", nowIso).lte("starts_at", new Date(now.getTime() + 14 * 864e5).toISOString())
      .order("starts_at").returns<ShiftRow[]>(),
    // Finished shifts in the last week with a participant but no note from me
    supabase.from("shifts").select("id,participant_id,progress_notes(author_id)")
      .eq("organisation_id", org.id).eq("staff_user_id", user.id).neq("status", "cancelled").not("participant_id", "is", null)
      .lt("ends_at", nowIso).gte("ends_at", new Date(now.getTime() - 7 * 864e5).toISOString()),
  ]);
  const notesDue = (recent ?? []).filter((s) => !(s.progress_notes as { author_id: string }[]).some((n) => n.author_id === user.id));

  type Stat = { label: string; value: number; href: string; alert?: boolean };
  let stats: Stat[] = [];
  let checklist: { label: string; done: boolean; href: string }[] = [];
  if (isManager(role)) {
    const count = async (table: string, f: (q: any) => any) => (await f(supabase.from(table).select("*", { count: "exact", head: true }).eq("organisation_id", org.id))).count ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any
    const [participants, openShifts, approvals1, approvals2, approvals3, incidents, members, anyShift] = await Promise.all([
      count("participants", (q) => q.eq("status", "active")),
      count("shifts", (q) => q.is("staff_user_id", null).in("status", ["draft", "published"]).gte("starts_at", nowIso).lte("starts_at", weekAhead)),
      count("timesheet_adjustments", (q) => q.eq("status", "pending")),
      count("expense_claims", (q) => q.eq("status", "pending")),
      count("travel_logs", (q) => q.eq("status", "pending")),
      count("incident_reports", (q) => q.in("status", ["open", "under_review"])),
      count("org_members", (q) => q.eq("status", "active")),
      count("shifts", (q) => q),
    ]);
    const approvals = approvals1 + approvals2 + approvals3;
    stats = [
      { label: "Open shifts next 7 days", value: openShifts, href: "/roster?staff=open", alert: openShifts > 0 },
      { label: "Waiting for approval", value: approvals, href: "/approvals", alert: approvals > 0 },
      { label: "Incidents needing attention", value: incidents, href: "/incidents", alert: incidents > 0 },
      { label: "Active participants", value: participants, href: "/participants" },
    ];
    if (isAdmin(role)) {
      checklist = [
        { label: "Add your logo and colours", done: !!org.logo_path, href: "/admin/settings" },
        { label: "Invite your team", done: members > 1, href: "/admin/staff" },
        { label: "Add a participant and their NDIS plan", done: participants > 0, href: "/participants/new" },
        { label: "Create your first shift", done: anyShift > 0, href: "/roster" },
      ];
      if (checklist.every((c) => c.done)) checklist = [];
    }
  }

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="card border-brand/40 bg-brand/5">
          <p className="font-medium">Welcome to {org.name}! 👋</p>
          <p className="mt-1 text-sm text-muted">
            Tip: add this app to your home screen — in Safari tap <strong>Share → Add to Home Screen</strong>; in Chrome tap <strong>⋮ → Install app</strong>.
          </p>
        </div>
      )}
      <h1 className="text-2xl font-bold tracking-tight">Hi {firstName}</h1>

      {checklist.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Get set up</h2>
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-3 text-sm">
                  <span className={`grid h-6 w-6 place-items-center rounded-full border ${c.done ? "border-success bg-success text-white" : "border-line"}`}>{c.done ? "✓" : ""}</span>
                  <span className={c.done ? "text-muted line-through" : "font-medium underline-offset-2 hover:underline"}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.length > 0 && (
        <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className={`card transition hover:border-brand ${s.alert ? "border-danger/40" : ""}`}>
              <div className={`text-3xl font-bold tabular-nums ${s.alert ? "text-danger" : ""}`}>{s.value}</div>
              <div className="mt-1 text-sm text-muted">{s.label}</div>
            </Link>
          ))}
        </section>
      )}

      {notesDue.length > 0 && (
        <Link href={`/shifts/${notesDue[0].id}`} className="card flex items-center gap-3 border-danger/40 bg-danger/5">
          <span className="text-xl" aria-hidden>📝</span>
          <span className="flex-1 text-sm"><strong>{notesDue.length} progress note{notesDue.length > 1 ? "s" : ""} to write</strong> from recent shifts.</span>
          <span className="text-sm font-medium text-brand">Write now →</span>
        </Link>
      )}

      <PushToggle vapidKey={env.vapid()?.publicKey ?? null} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">My upcoming shifts</h2>
          <Link href="/shifts" className="text-sm text-brand underline">All shifts</Link>
        </div>
        {!shifts?.length ? (
          <div className="card text-sm text-muted">No shifts in the next two weeks.</div>
        ) : (
          <ul className="space-y-3">
            {shifts.map((s) => {
              const { day, time } = formatShiftRange(s.starts_at, s.ends_at, org.timezone);
              const p = s.participant;
              return (
                <li key={s.id}>
                  <Link href={`/shifts/${s.id}`} className="card flex items-center gap-4 transition hover:border-brand">
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-xs font-semibold uppercase text-brand">{day.split(" ")[0]}</div>
                      <div className="text-lg font-bold">{day.split(" ").slice(1).join(" ")}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{p ? `${p.preferred_name || p.first_name} ${p.last_name}` : "No participant"}</div>
                      <div className="text-sm text-muted">{time} · {hoursBetween(s.starts_at, s.ends_at, s.break_minutes).toFixed(1)} h</div>
                      {s.location && <div className="truncate text-sm text-muted">{s.location}</div>}
                    </div>
                    {s.status === "in_progress" && <span className="badge bg-success/10 text-success">On shift</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
