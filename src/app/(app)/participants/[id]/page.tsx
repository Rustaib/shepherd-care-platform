import Link from "next/link";
import { notFound } from "next/navigation";
import { ageFrom, categoryLabel, displayName, formatDate, MANAGEMENT_LABEL, money } from "@/lib/ndis";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";
import { setParticipantStatus } from "../actions";

export const metadata = { title: "Participant" };

type Plan = {
  id: string; start_date: string; end_date: string; management_type: string; status: string;
  plan_manager_name: string | null; plan_manager_email: string | null; goals: string | null;
};
type Usage = { plan_budget_id: string; plan_id: string; category: string; allocated_amount: number; spent: number; committed: number };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (<><dt className="text-sm text-muted">{label}</dt><dd className="text-sm">{children || "—"}</dd></>);
}

function BudgetBar({ u }: { u: Usage }) {
  const total = Number(u.allocated_amount), spent = Number(u.spent), committed = Number(u.committed);
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  const remaining = total - spent - committed;
  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{categoryLabel(u.category)}</span>
        <span className="tabular-nums text-muted">{money(spent)} used of {money(total)}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface" role="img"
        aria-label={`${money(spent)} used, ${money(committed)} booked, ${money(remaining)} remaining`}>
        <div className="bg-brand" style={{ width: `${pct(spent)}%` }} />
        <div className="bg-brand/40" style={{ width: `${pct(committed)}%` }} />
      </div>
      <div className={`text-xs tabular-nums ${remaining < 0 ? "font-semibold text-danger" : "text-muted"}`}>
        {committed > 0 && <>{money(committed)} booked · </>}
        {remaining < 0 ? `Over budget by ${money(-remaining)}` : `${money(remaining)} remaining`}
      </div>
    </li>
  );
}

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, organisation: org } = await requireMembership();
  const tz = org.timezone;
  const manager = isManager(role);
  const { supabase } = await requireUser();

  const nowIso = new Date().toISOString();
  const twoWeeks = new Date(Date.now() + 14 * 864e5).toISOString();
  const [{ data: p }, { data: plans }, { data: usage }, { data: upShifts }, { data: upAppts }] = await Promise.all([
    supabase.from("participants").select("*").eq("id", id).maybeSingle(),
    supabase.from("ndis_plans").select("id,start_date,end_date,management_type,status,plan_manager_name,plan_manager_email,goals")
      .eq("participant_id", id).order("start_date", { ascending: false }).returns<Plan[]>(),
    manager
      ? supabase.from("plan_budget_usage").select("*").order("category").returns<Usage[]>()
      : Promise.resolve({ data: [] as Usage[] }),
    supabase.from("shifts").select("id,starts_at,ends_at,status,staff:profiles(full_name,email)")
      .eq("participant_id", id).in("status", ["draft", "published", "in_progress"])
      .gte("ends_at", nowIso).lte("starts_at", twoWeeks).order("starts_at")
      .returns<{ id: string; starts_at: string; ends_at: string; status: string; staff: { full_name: string; email: string } | null }[]>(),
    supabase.from("appointments").select("id,title,starts_at,location")
      .eq("participant_id", id).gte("starts_at", nowIso).lte("starts_at", twoWeeks).order("starts_at")
      .returns<{ id: string; title: string; starts_at: string; location: string | null }[]>(),
  ]);
  if (!p) notFound();
  type Item = { kind: "shift" | "appt"; id: string; at: string; title: string; sub: string; href: string | null };
  const upcoming: Item[] = [
    ...(upShifts ?? []).map((s) => ({
      kind: "shift" as const, id: s.id, at: s.starts_at,
      title: `${timeLabel(s.starts_at, tz)}–${timeLabel(s.ends_at, tz)} support shift${s.status === "draft" ? " (draft)" : ""}`,
      sub: s.staff ? (s.staff.full_name || s.staff.email) : "Open shift",
      href: manager ? `/roster/shifts/${s.id}` : null,
    })),
    ...(upAppts ?? []).map((a) => ({
      kind: "appt" as const, id: a.id, at: a.starts_at,
      title: `${timeLabel(a.starts_at, tz)} ${a.title}`, sub: a.location ?? "",
      href: manager ? `/roster/appointments/${a.id}` : null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const today = new Date().toISOString().slice(0, 10);
  const current = plans?.find((pl) => pl.start_date <= today && pl.end_date >= today && pl.status !== "draft");
  const others = plans?.filter((pl) => pl.id !== current?.id) ?? [];
  const usageFor = (planId: string) => (usage ?? []).filter((u) => u.plan_id === planId);
  const age = ageFrom(p.date_of_birth);
  const address = [p.address_line1, p.address_line2, [p.suburb, p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const daysLeft = current ? Math.ceil((new Date(current.end_date).getTime() - Date.now()) / 864e5) : null;

  return (
    <div className="space-y-6">
      {manager && <Link href="/participants" className="text-sm text-muted hover:text-ink">← Participants</Link>}

      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-lg font-semibold text-brand">{p.first_name[0]}{p.last_name[0]}</div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{displayName(p)}</h1>
          <p className="text-sm text-muted">
            {[p.preferred_name && `${p.first_name} ${p.last_name}`, p.ndis_number && `NDIS ${p.ndis_number}`, age !== null && `${age} years`].filter(Boolean).join(" · ")}
          </p>
        </div>
        {p.status !== "active" && <span className="badge capitalize">{p.status}</span>}
        {manager && <Link href={`/participants/${id}/edit`} className="btn-ghost">Edit</Link>}
      </div>

      {p.support_notes && (
        <section className="card border-accent/50 bg-accent/5">
          <h2 className="mb-2 font-semibold">Support notes</h2>
          <p className="whitespace-pre-wrap text-sm">{p.support_notes}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Details</h2>
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2">
            <Row label="Date of birth">{p.date_of_birth && formatDate(p.date_of_birth)}</Row>
            <Row label="Phone">{p.phone && <a href={`tel:${p.phone}`} className="text-brand underline">{p.phone}</a>}</Row>
            <Row label="Email">{p.email}</Row>
            <Row label="Address">{address && <a className="text-brand underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}>{address}</a>}</Row>
          </dl>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Emergency contact</h2>
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2">
            <Row label="Name">{p.emergency_contact_name}</Row>
            <Row label="Relationship">{p.emergency_contact_relationship}</Row>
            <Row label="Phone">{p.emergency_contact_phone && <a href={`tel:${p.emergency_contact_phone}`} className="text-brand underline">{p.emergency_contact_phone}</a>}</Row>
          </dl>
        </section>
      </div>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Next two weeks</h2>
          {manager && (
            <div className="flex gap-2">
              <Link href={`/roster/appointments/new?participant=${id}`} className="btn-ghost">+ Appointment</Link>
              <Link href={`/roster/shifts/new?participant=${id}`} className="btn-ghost">+ Shift</Link>
            </div>
          )}
        </div>
        {!upcoming.length ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
          <ul className="divide-y divide-line">
            {upcoming.map((u) => {
              const inner = (
                <div className="flex items-center gap-3 py-2.5">
                  <div className="w-24 shrink-0 text-sm font-medium">{dayLabel(utcToLocal(u.at, tz).date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.kind === "appt" ? "📅 " : ""}{u.title}</div>
                    {u.sub && <div className={`truncate text-xs ${u.sub === "Open shift" ? "font-semibold text-danger" : "text-muted"}`}>{u.sub}</div>}
                  </div>
                </div>
              );
              return <li key={u.kind + u.id}>{u.href ? <Link href={u.href} className="block hover:bg-surface">{inner}</Link> : inner}</li>;
            })}
          </ul>
        )}
      </section>

      <section className="card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">NDIS plan</h2>
          {manager && <Link href={`/participants/${id}/plans/new`} className="btn-ghost">+ Add plan</Link>}
        </div>

        {!current ? (
          <p className="text-sm text-muted">No current plan{others.length ? " — see other plans below." : "."}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{formatDate(current.start_date)} – {formatDate(current.end_date)}</span>
              <span className="badge">{MANAGEMENT_LABEL[current.management_type]}</span>
              {daysLeft !== null && daysLeft <= 60 && <span className="badge bg-accent/15 text-ink">Ends in {daysLeft} days</span>}
              {manager && <Link href={`/participants/${id}/plans/${current.id}/edit`} className="ml-auto text-sm text-brand underline">Edit plan</Link>}
            </div>
            {manager && current.plan_manager_name && (
              <p className="text-sm text-muted">Plan manager: {current.plan_manager_name}{current.plan_manager_email && ` · ${current.plan_manager_email}`}</p>
            )}
            {current.goals && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold">Goals</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {current.goals.split("\n").filter((g) => g.trim()).map((g, i) => <li key={i}>{g.replace(/^[-•*]\s*/, "")}</li>)}
                </ul>
              </div>
            )}
            {manager && (
              usageFor(current.id).length ? (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Budgets</h3>
                  <ul className="space-y-4">{usageFor(current.id).map((u) => <BudgetBar key={u.plan_budget_id} u={u} />)}</ul>
                  <p className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-brand" />Used (completed shifts)</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-brand/40" />Booked (upcoming shifts)</span>
                  </p>
                </div>
              ) : <p className="text-sm text-muted">No budgets entered for this plan.</p>
            )}
          </div>
        )}

        {manager && others.length > 0 && (
          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold">Other plans</h3>
            <ul className="divide-y divide-line">
              {others.map((pl) => (
                <li key={pl.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span>{formatDate(pl.start_date)} – {formatDate(pl.end_date)}</span>
                  <span className="badge capitalize">{pl.end_date < today ? "Ended" : pl.start_date > today ? "Upcoming" : pl.status}</span>
                  <Link href={`/participants/${id}/plans/${pl.id}/edit`} className="ml-auto text-brand underline">View / edit</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {manager && (
        <section className="flex flex-wrap gap-2 border-t border-line pt-6">
          {p.status !== "active" && <form action={setParticipantStatus.bind(null, id, "active")}><button className="btn-ghost">Mark active</button></form>}
          {p.status === "active" && <form action={setParticipantStatus.bind(null, id, "inactive")}><button className="btn-ghost">Mark inactive</button></form>}
          {p.status !== "archived" && <form action={setParticipantStatus.bind(null, id, "archived")}><button className="btn-ghost text-danger">Archive</button></form>}
        </section>
      )}
    </div>
  );
}
