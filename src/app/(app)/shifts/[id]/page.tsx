import Link from "next/link";
import { notFound } from "next/navigation";
import { CLAIM_STATUS, expenseLabel } from "@/lib/claims";
import { displayName, money } from "@/lib/ndis";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { dayLabel, timeLabel, utcToLocal } from "@/lib/time";
import { directionsUrl, shiftAppointments } from "@/lib/appointments";
import { ClockPanel, EditableNote, ExpenseForm, ExtraHoursForm, KmForm, NoteForm, WithdrawButton } from "../shift-client";

export const metadata = { title: "Shift" };

function Status({ s }: { s: string }) {
  const c = CLAIM_STATUS[s];
  return <span className={`badge ${c?.cls ?? ""}`}>{c?.label ?? s}</span>;
}

function Section({ title, children, open = true, count }: { title: string; children: React.ReactNode; open?: boolean; count?: number }) {
  return (
    <details open={open} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        <span>{title}{count ? <span className="ml-2 badge">{count}</span> : null}</span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden>⌄</span>
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, organisation: org } = await requireMembership();
  const { supabase, user } = await requireUser();
  const tz = org.timezone;

  const { data: s } = await supabase.from("shifts")
    .select("*, participant:participants(id,first_name,last_name,preferred_name,support_notes,phone,address_line1,suburb), staff:profiles(full_name,email)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!s) notFound();

  const mine = s.staff_user_id === user.id;
  const manager = isManager(role);
  const p = s.participant as null | { id: string; first_name: string; last_name: string; preferred_name: string | null; support_notes: string | null; phone: string | null; address_line1: string | null; suburb: string | null };
  const started = Date.parse(s.starts_at) <= Date.now() || ["in_progress", "completed"].includes(s.status);
  const canClockIn = Date.now() >= Date.parse(s.starts_at) - 2 * 36e5 && Date.now() <= Date.parse(s.ends_at);
  const st = utcToLocal(s.starts_at, tz);

  const [appts, { data: notes }, { data: plan }, { data: expenses }, { data: km }, { data: extra }] = await Promise.all([
    shiftAppointments(supabase, s),
    supabase.from("progress_notes").select("id,body,goals_addressed,created_at,author_id,author:profiles(full_name)")
      .eq("shift_id", id).order("created_at"),
    p ? supabase.from("ndis_plans").select("goals").eq("participant_id", p.id)
      .lte("start_date", st.date).gte("end_date", st.date).neq("status", "draft").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("expense_claims").select("id,category,amount,description,status,review_notes").eq("shift_id", id).order("created_at"),
    supabase.from("travel_logs").select("id,kilometres,purpose,status").eq("shift_id", id).order("created_at"),
    supabase.from("timesheet_adjustments").select("id,extra_minutes,reason,status,review_notes").eq("shift_id", id).order("created_at"),
  ]);

  const goals = (plan?.goals ?? "").split("\n").map((g: string) => g.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const address = s.location || [p?.address_line1, p?.suburb].filter(Boolean).join(", ");
  const hours = (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 36e5 - s.break_minutes / 60;
  const path = `/shifts/${id}`;
  type Note = { id: string; body: string; goals_addressed: string[] | null; created_at: string; author_id: string; author: { full_name: string } | null };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={manager && !mine ? `/roster/shifts/${id}` : "/shifts"} className="text-sm text-muted hover:text-ink">
        ← {manager && !mine ? "Edit in roster" : "My shifts"}
      </Link>

      <header className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{dayLabel(st.date)}</h1>
          <span className="text-lg tabular-nums">{timeLabel(s.starts_at, tz)} – {timeLabel(s.ends_at, tz)}</span>
          <span className="badge capitalize">{s.status.replace("_", " ")}</span>
        </div>
        <p className="text-sm text-muted">{hours.toFixed(2)} hours{s.break_minutes ? ` (incl. ${s.break_minutes} min unpaid break deducted)` : ""}</p>
        {p && (
          <div className="text-base font-semibold">
            <Link href={`/participants/${p.id}`} className="text-brand underline">{displayName(p)}</Link>
            {p.phone && <a href={`tel:${p.phone}`} className="ml-3 text-sm font-normal text-brand underline">Call</a>}
          </div>
        )}
        {!mine && <p className="text-sm text-muted">Worker: {s.staff ? (s.staff.full_name || s.staff.email) : "Open shift"}</p>}
        {address && (
          <a className="block text-sm text-brand underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}>📍 {address}</a>
        )}
        {s.instructions && <p className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm">{s.instructions}</p>}
        {mine && <ClockPanel shiftId={id} status={s.status} canClockIn={canClockIn} />}
        {s.clock_in_at && (
          <p className="text-xs text-muted">
            Clocked in {timeLabel(s.clock_in_at, tz)}{s.clock_out_at && ` · out ${timeLabel(s.clock_out_at, tz)}`}
          </p>
        )}
      </header>

      {appts.length > 0 && (
        <section className="card space-y-3 border-accent/50 bg-accent/5">
          <h2 className="font-semibold">📅 Appointments on this shift</h2>
          <ul className="space-y-3 text-sm">
            {appts.map((a) => (
              <li key={a.id} className="rounded-xl bg-card p-3">
                <div className="font-semibold">
                  {timeLabel(a.starts_at, tz)}{a.ends_at && `–${timeLabel(a.ends_at, tz)}`} · {a.title}
                </div>
                {a.location && <div className="mt-0.5 text-muted">📍 {a.location}</div>}
                {a.notes && <div className="mt-1 whitespace-pre-wrap">{a.notes}</div>}
                {a.location && (
                  <a href={directionsUrl(a.location)} target="_blank" rel="noreferrer" className="btn-primary mt-2 px-3 py-1.5 text-sm">Get directions</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p?.support_notes && (
        <Section title="Support notes" open={!started}>
          <p className="whitespace-pre-wrap text-sm">{p.support_notes}</p>
        </Section>
      )}

      {p && (
        <Section title="Progress notes" count={notes?.length}>
          {(notes as Note[] | null)?.map((n) => (
            <article key={n.id} className="border-b border-line pb-3 last:border-0">
              <p className="mb-1 text-xs text-muted">{n.author?.full_name ?? "Staff"} · {timeLabel(n.created_at, tz)} {dayLabel(utcToLocal(n.created_at, tz).date)}</p>
              <EditableNote id={n.id} shiftId={id} body={n.body}
                canEdit={n.author_id === user.id && Date.now() - Date.parse(n.created_at) < 24 * 36e5} />
              {!!n.goals_addressed?.length && <p className="mt-1 text-xs text-muted">Goals: {n.goals_addressed.join("; ")}</p>}
            </article>
          ))}
          {mine && started && <NoteForm shiftId={id} goals={goals} />}
          {mine && !started && <p className="text-sm text-muted">You can write a progress note once the shift starts.</p>}
          {!mine && !notes?.length && <p className="text-sm text-muted">No notes yet.</p>}
        </Section>
      )}

      {(mine || manager) && (
        <>
          <Section title="Expenses" open={false} count={expenses?.length}>
            <ul className="space-y-2">
              {expenses?.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium tabular-nums">{money(e.amount)}</span>
                  <span className="text-muted">{expenseLabel(e.category)} — {e.description}</span>
                  <Status s={e.status} />
                  {mine && e.status === "pending" && <WithdrawButton table="expense_claims" id={e.id} path={path} />}
                  {e.review_notes && <span className="w-full text-xs text-muted">Note: {e.review_notes}</span>}
                </li>
              ))}
            </ul>
            {mine && <ExpenseForm shiftId={id} date={st.date} />}
          </Section>

          <Section title="Kilometres" open={false} count={km?.length}>
            <ul className="space-y-2">
              {km?.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium tabular-nums">{Number(k.kilometres)} km</span>
                  <span className="text-muted">{k.purpose}</span>
                  <Status s={k.status} />
                  {mine && k.status === "pending" && <WithdrawButton table="travel_logs" id={k.id} path={path} />}
                </li>
              ))}
            </ul>
            {mine && <KmForm shiftId={id} date={st.date} defaultFrom={address || undefined} />}
          </Section>

          <Section title="Extra hours" open={false} count={extra?.length}>
            <ul className="space-y-2">
              {extra?.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">+{x.extra_minutes} min</span>
                  <span className="text-muted">{x.reason}</span>
                  <Status s={x.status} />
                  {mine && x.status === "pending" && <WithdrawButton table="timesheet_adjustments" id={x.id} path={path} />}
                  {x.review_notes && <span className="w-full text-xs text-muted">Note: {x.review_notes}</span>}
                </li>
              ))}
            </ul>
            {mine && started && !extra?.some((x) => x.status === "pending") && <ExtraHoursForm shiftId={id} />}
            {mine && !started && <p className="text-sm text-muted">If you work past the rostered finish, request the extra time here.</p>}
          </Section>
        </>
      )}

      {mine && (
        <Link href={`/incidents/new?shift=${id}`} className="btn-ghost w-full border-danger/40 text-danger">⚠ Report an incident</Link>
      )}
    </div>
  );
}
