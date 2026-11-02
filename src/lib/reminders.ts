import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { escapeHtml, sendEmail } from "@/lib/email";
import { displayName } from "@/lib/ndis";
import { sendPushToUser } from "@/lib/push";
import { portalUrl } from "@/lib/tenant";
import { directionsUrl } from "@/lib/appointments";
import { addDaysLocal, dayLabel, localRangeUtc, timeLabel, todayIn } from "@/lib/time";

type Org = { id: string; name: string; timezone: string; reminder_hour_local: number; brand_primary: string; custom_domain: string | null; domain_status: string };
type Shift = {
  id: string; starts_at: string; ends_at: string; location: string | null; instructions: string | null;
  staff_user_id: string; participant_id: string | null;
  participant: { first_name: string; last_name: string; preferred_name: string | null } | null;
  staff: { full_name: string; email: string } | null;
};

/** Sends tomorrow's shift reminders for organisations whose local reminder hour is now.
 *  Safe to run every hour: each shift is reminded once (reminder_sent_at). */
export async function runShiftReminders(admin: SupabaseClient, opts: { force?: boolean } = {}) {
  const { data: orgs } = await admin.from("organisations")
    .select("id,name,timezone,reminder_hour_local,brand_primary,custom_domain,domain_status");
  const summary: { org: string; workers: number; shifts: number }[] = [];

  for (const org of (orgs ?? []) as Org[]) {
    const localHour = Number(formatInTimeZone(new Date(), org.timezone, "H"));
    if (!opts.force && localHour !== org.reminder_hour_local) continue;

    const tomorrow = addDaysLocal(todayIn(org.timezone), 1);
    const { start, end } = localRangeUtc(tomorrow, 1, org.timezone);
    const { data: shifts } = await admin.from("shifts")
      .select("id,starts_at,ends_at,location,instructions,staff_user_id,participant_id,participant:participants(first_name,last_name,preferred_name),staff:profiles(full_name,email)")
      .eq("organisation_id", org.id).eq("status", "published").not("staff_user_id", "is", null)
      .is("reminder_sent_at", null).gte("starts_at", start).lt("starts_at", end).order("starts_at")
      .returns<Shift[]>();
    if (!shifts?.length) continue;

    // Appointments linked to these shifts, or for their participants around tomorrow
    type Appt = { participant_id: string; shift_id: string | null; title: string; starts_at: string; location: string | null };
    const participantIds = [...new Set(shifts.map((s) => s.participant_id).filter(Boolean))] as string[];
    const shiftIds = shifts.map((s) => s.id);
    const [{ data: byPerson }, { data: linked }] = await Promise.all([
      participantIds.length
        ? admin.from("appointments").select("participant_id,shift_id,title,starts_at,location").is("shift_id", null)
            .in("participant_id", participantIds).gte("starts_at", new Date(Date.parse(start) - 36e5).toISOString())
            .lt("starts_at", localRangeUtc(tomorrow, 2, org.timezone).end)
        : Promise.resolve({ data: [] as Appt[] }),
      admin.from("appointments").select("participant_id,shift_id,title,starts_at,location").in("shift_id", shiftIds),
    ]);
    const appts = [...(byPerson ?? []), ...(linked ?? [])] as Appt[];

    const byWorker = new Map<string, Shift[]>();
    for (const s of shifts) byWorker.set(s.staff_user_id, [...(byWorker.get(s.staff_user_id) ?? []), s]);

    const base = portalUrl(org);
    for (const [workerId, list] of byWorker) {
      const tz = org.timezone;
      const lines = list.map((s) => {
        const who = s.participant ? displayName(s.participant) : "No participant";
        const from = new Date(Date.parse(s.starts_at) - 36e5).toISOString();
        const during = appts
          .filter((a) => a.shift_id === s.id || (!a.shift_id && a.participant_id === s.participant_id && a.starts_at >= from && a.starts_at < s.ends_at))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return { s, who, during };
      });
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px">
          <h2 style="margin:0 0 4px">Your shifts tomorrow</h2>
          <p style="margin:0 0 16px;color:#5b6673">${escapeHtml(dayLabel(tomorrow))} · ${escapeHtml(org.name)}</p>
          ${lines.map(({ s, who, during }) => `
            <div style="border:1px solid #e2e6ea;border-radius:12px;padding:12px 14px;margin-bottom:10px">
              <strong>${timeLabel(s.starts_at, tz)} – ${timeLabel(s.ends_at, tz)}</strong> · ${escapeHtml(who)}<br>
              ${s.location ? `<span style="color:#5b6673">📍 ${escapeHtml(s.location)}</span><br>` : ""}
              ${s.instructions ? `<div style="margin-top:6px">${escapeHtml(s.instructions)}</div>` : ""}
              ${during.map((a) => `<div style="margin-top:6px;background:#fff7e6;padding:6px 8px;border-radius:8px">📅 ${timeLabel(a.starts_at, tz)} ${escapeHtml(a.title)}${a.location ? ` · ${escapeHtml(a.location)}` : ""}</div>`).join("")}
              <div style="margin-top:8px"><a href="${base}/shifts/${s.id}" style="color:${org.brand_primary}">Open shift</a></div>
            </div>`).join("")}
        </div>`;
      const email = list[0].staff?.email;
      if (email) await sendEmail(email, `Reminder: ${list.length} shift${list.length > 1 ? "s" : ""} tomorrow`, html);

      const first = lines[0];
      const apptCount = lines.reduce((n, l) => n + l.during.length, 0);
      await sendPushToUser(admin, workerId, {
        title: `Tomorrow: ${timeLabel(first.s.starts_at, org.timezone)} with ${first.who}`,
        body: `${list.length > 1 ? `${list.length} shifts tomorrow. ` : ""}${apptCount ? `${apptCount} appointment${apptCount > 1 ? "s" : ""} during your shift.` : "Tap for details."}`,
        url: `/shifts/${first.s.id}`,
      });
    }

    await admin.from("shifts").update({ reminder_sent_at: new Date().toISOString() }).in("id", shifts.map((s) => s.id));
    summary.push({ org: org.id, workers: byWorker.size, shifts: shifts.length });
  }
  return summary;
}

/** Reminds the worker about an appointment 15–75 minutes before it starts
 *  (the hourly cron checks the next window each run, so each is sent once).
 *  The worker is the one on the linked shift, or on the participant's shift
 *  covering the appointment time. */
export async function runAppointmentReminders(admin: SupabaseClient) {
  const now = Date.now();
  const { data: appts } = await admin.from("appointments")
    .select("id,organisation_id,participant_id,shift_id,title,starts_at,location,notes,participant:participants(first_name,last_name,preferred_name),organisation:organisations(name,timezone,brand_primary,custom_domain,domain_status)")
    .is("reminder_sent_at", null)
    .gt("starts_at", new Date(now + 15 * 60e3).toISOString())
    .lte("starts_at", new Date(now + 75 * 60e3).toISOString());
  type A = {
    id: string; organisation_id: string; participant_id: string; shift_id: string | null; title: string; starts_at: string;
    location: string | null; notes: string | null;
    participant: { first_name: string; last_name: string; preferred_name: string | null };
    organisation: { name: string; timezone: string; brand_primary: string; custom_domain: string | null; domain_status: string };
  };
  let sent = 0;
  for (const a of (appts ?? []) as unknown as A[]) {
    // Find the shift: linked, else the participant's published shift covering the time
    let q = admin.from("shifts").select("id,staff_user_id,staff:profiles(email)").in("status", ["published", "in_progress"]).not("staff_user_id", "is", null);
    q = a.shift_id
      ? q.eq("id", a.shift_id)
      : q.eq("participant_id", a.participant_id).lte("starts_at", new Date(Date.parse(a.starts_at) + 36e5).toISOString()).gt("ends_at", a.starts_at);
    const { data: shift } = await q.limit(1).maybeSingle();
    await admin.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", a.id);
    if (!shift?.staff_user_id) continue;

    const tz = a.organisation.timezone;
    const who = displayName(a.participant);
    const link = `${portalUrl(a.organisation)}/shifts/${shift.id}`;
    await sendPushToUser(admin, shift.staff_user_id, {
      title: `${timeLabel(a.starts_at, tz)}: ${a.title} with ${who}`,
      body: a.location ? `At ${a.location}. Tap for directions.` : "Tap for details.",
      url: `/shifts/${shift.id}`,
    });
    const email = (shift.staff as unknown as { email: string } | null)?.email;
    if (email) {
      await sendEmail(email, `Coming up at ${timeLabel(a.starts_at, tz)}: ${a.title} with ${who}`, `
        <div style="font-family:system-ui,sans-serif;max-width:520px">
          <h2 style="margin:0 0 8px">${escapeHtml(a.title)} at ${timeLabel(a.starts_at, tz)}</h2>
          <p style="margin:0 0 6px">With <strong>${escapeHtml(who)}</strong> · ${escapeHtml(a.organisation.name)}</p>
          ${a.location ? `<p style="margin:0 0 6px">📍 ${escapeHtml(a.location)} — <a href="${directionsUrl(a.location)}">Get directions</a></p>` : ""}
          ${a.notes ? `<p style="margin:0 0 6px">${escapeHtml(a.notes)}</p>` : ""}
          <p><a href="${link}" style="color:${a.organisation.brand_primary}">Open your shift</a></p>
        </div>`);
    }
    sent++;
  }
  return sent;
}
