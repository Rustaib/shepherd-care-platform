import Link from "next/link";
import { formatShiftRange, hoursBetween } from "@/lib/format";
import { isManager, requireMembership, requireUser } from "@/lib/org";

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
  const fortnight = new Date(now.getTime() + 14 * 864e5);
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id,starts_at,ends_at,break_minutes,status,location,participant:participants(first_name,last_name,preferred_name)")
    .eq("organisation_id", org.id)
    .eq("staff_user_id", user.id)
    .neq("status", "cancelled")
    .gte("ends_at", now.toISOString())
    .lte("starts_at", fortnight.toISOString())
    .order("starts_at")
    .returns<ShiftRow[]>();

  let stats: { label: string; value: number; href?: string }[] = [];
  if (isManager(role)) {
    const count = async (table: string, filter: (q: any) => any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      const { count } = await filter(supabase.from(table).select("*", { count: "exact", head: true }).eq("organisation_id", org.id));
      return count ?? 0;
    };
    const [staff, invites, participants, pending] = await Promise.all([
      count("org_members", (q) => q.eq("status", "active")),
      count("invitations", (q) => q.is("accepted_at", null).gt("expires_at", now.toISOString())),
      count("participants", (q) => q.eq("status", "active")),
      count("timesheet_adjustments", (q) => q.eq("status", "pending")),
    ]);
    stats = [
      { label: "Active team members", value: staff, href: "/admin/staff" },
      { label: "Pending invitations", value: invites, href: "/admin/staff" },
      { label: "Active participants", value: participants },
      { label: "Extra-hours requests", value: pending },
    ];
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

      {stats.length > 0 && (
        <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => {
            const inner = (<><div className="text-3xl font-bold tabular-nums">{s.value}</div><div className="mt-1 text-sm text-muted">{s.label}</div></>);
            return s.href
              ? <Link key={s.label} href={s.href} className="card transition hover:border-brand">{inner}</Link>
              : <div key={s.label} className="card">{inner}</div>;
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My upcoming shifts</h2>
        {!shifts?.length ? (
          <div className="card text-sm text-muted">No shifts in the next two weeks.</div>
        ) : (
          <ul className="space-y-3">
            {shifts.map((s) => {
              const { day, time } = formatShiftRange(s.starts_at, s.ends_at, org.timezone);
              const p = s.participant;
              return (
                <li key={s.id} className="card flex items-center gap-4">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-xs font-semibold uppercase text-brand">{day.split(" ")[0]}</div>
                    <div className="text-lg font-bold">{day.split(" ").slice(1).join(" ")}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p ? `${p.preferred_name || p.first_name} ${p.last_name}` : "Unassigned participant"}</div>
                    <div className="text-sm text-muted">{time} · {hoursBetween(s.starts_at, s.ends_at, s.break_minutes).toFixed(1)} h</div>
                    {s.location && <div className="truncate text-sm text-muted">{s.location}</div>}
                  </div>
                  {s.status === "in_progress" && <span className="badge bg-success/10 text-success">On shift</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
