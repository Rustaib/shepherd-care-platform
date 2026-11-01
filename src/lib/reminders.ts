import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { escapeHtml, sendEmail } from "@/lib/email";
import { displayName } from "@/lib/ndis";
import { sendPushToUser } from "@/lib/push";
import { portalUrl } from "@/lib/tenant";
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

    // Appointments for these participants tomorrow (plus overnight spill)
    const participantIds = [...new Set(shifts.map((s) => s.participant_id).filter(Boolean))] as string[];
    const { data: appts } = participantIds.length
      ? await admin.from("appointments").select("participant_id,title,starts_at,location")
          .in("participant_id", participantIds).gte("starts_at", start).lt("starts_at", localRangeUtc(tomorrow, 2, org.timezone).end)
      : { data: [] as { participant_id: string; title: string; starts_at: string; location: string | null }[] };

    const byWorker = new Map<string, Shift[]>();
    for (const s of shifts) byWorker.set(s.staff_user_id, [...(byWorker.get(s.staff_user_id) ?? []), s]);

    const base = portalUrl(org);
    for (const [workerId, list] of byWorker) {
      const tz = org.timezone;
      const lines = list.map((s) => {
        const who = s.participant ? displayName(s.participant) : "No participant";
        const during = (appts ?? []).filter((a) => a.participant_id === s.participant_id && a.starts_at >= s.starts_at && a.starts_at < s.ends_at);
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
