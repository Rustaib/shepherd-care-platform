"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { linesForShift, type Service } from "@/lib/invoice-lines";
import { requireManager, requireUser } from "@/lib/org";
import { addDaysLocal, dayLabel, isValidDate, isValidTime, localRangeUtc, shiftBounds, utcToLocal } from "@/lib/time";

export type ShiftState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const uuidOrNull = z.string().transform((v) => v || null).pipe(z.uuid().nullable());
const schema = z.object({
  participant_id: uuidOrNull,
  staff_user_id: uuidOrNull,
  date: z.string().refine(isValidDate, "Choose a date"),
  start: z.string().refine(isValidTime, "Start time required"),
  end: z.string().refine(isValidTime, "End time required"),
  break_minutes: z.coerce.number().int().min(0).max(240),
  location: z.string().trim().transform((v) => v || null),
  instructions: z.string().trim().transform((v) => v || null),
  plan_budget_id: uuidOrNull,
  service_id: uuidOrNull.optional().transform((v) => v ?? null),
  support_item_code: z.string().trim().transform((v) => v || null),
  charge_rate: z.string().trim().transform((v) => (v ? Number(v.replace(/[$,]/g, "")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Invalid rate"),
  status: z.enum(["draft", "published"]),
  repeat_weeks: z.coerce.number().int().min(0).max(12).default(0),
});

const CLASH_MSG = "That worker is already booked at an overlapping time.";
const friendly = (e: { code?: string; message: string }) => (e.code === "23P01" ? CLASH_MSG : e.message);

/** Blended $/hour from the shift's service and time of day, for budget tracking. */
async function rateEstimator(supabase: Supa, org: { id: string; timezone: string; state: string }, serviceId: string | null) {
  if (!serviceId) return () => null;
  const [{ data: service }, { data: hols }] = await Promise.all([
    supabase.from("services").select("*").eq("id", serviceId).maybeSingle(),
    supabase.from("public_holidays").select("holiday_date").eq("state", org.state).or(`organisation_id.is.null,organisation_id.eq.${org.id}`),
  ]);
  if (!service) return () => null;
  const holidays = new Set((hols ?? []).map((h) => h.holiday_date as string));
  return (starts_at: string, ends_at: string, break_minutes: number) => {
    const { lines } = linesForShift(
      { id: "est", starts_at, ends_at, break_minutes, extra_minutes: 0, km: 0, support_item_code: null, charge_rate: null, service: service as Service },
      { tz: org.timezone, holidays, participantName: "", lineFormat: "", kmRate: 0 },
    );
    const hours = lines.reduce((t, l) => t + (l.unit === "Hours" ? l.quantity : 0), 0);
    const amount = lines.reduce((t, l) => t + l.amount, 0);
    return hours > 0 ? Math.round((amount / hours) * 100) / 100 : lines.length ? amount : null;
  };
}

type Supa = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Returns the first overlapping shift for a staff member, if any. */
async function findClash(supabase: Supa, orgId: string, staffId: string, startsAt: string, endsAt: string, excludeId?: string) {
  let q = supabase.from("shifts").select("id,starts_at")
    .eq("organisation_id", orgId).eq("staff_user_id", staffId).neq("status", "cancelled")
    .lt("starts_at", endsAt).gt("ends_at", startsAt).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return data?.[0] ?? null;
}

export async function saveShift(shiftId: string | null, _: ShiftState, formData: FormData): Promise<ShiftState> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.start === d.end) return { error: "Start and end can't be the same.", fieldErrors: { end: "Same as start" } };

  const weeks = shiftId ? 0 : d.repeat_weeks;
  const estimate = await rateEstimator(supabase, org, d.service_id);
  const rows = [];
  for (let w = 0; w <= weeks; w++) {
    const date = addDaysLocal(d.date, w * 7);
    const { starts_at, ends_at } = shiftBounds(date, d.start, d.end, org.timezone);
    const hours = (Date.parse(ends_at) - Date.parse(starts_at)) / 36e5;
    if (d.break_minutes / 60 >= hours) return { error: "Break is longer than the shift.", fieldErrors: { break_minutes: "Too long" } };
    if (d.staff_user_id) {
      const clash = await findClash(supabase, org.id, d.staff_user_id, starts_at, ends_at, shiftId ?? undefined);
      if (clash) {
        return { error: `This worker already has a shift overlapping ${dayLabel(utcToLocal(clash.starts_at, org.timezone).date)}. Choose another worker or time.` };
      }
    }
    rows.push({
      organisation_id: org.id,
      participant_id: d.participant_id,
      staff_user_id: d.staff_user_id,
      starts_at, ends_at,
      break_minutes: d.break_minutes,
      location: d.location,
      instructions: d.instructions,
      plan_budget_id: d.plan_budget_id,
      service_id: d.service_id,
      estimated_rate: estimate(starts_at, ends_at, d.break_minutes),
      support_item_code: d.support_item_code,
      charge_rate: d.charge_rate,
      status: d.status,
    });
  }

  if (shiftId) {
    const { data: existing } = await supabase.from("shifts").select("status").eq("id", shiftId).single();
    // Don't let the form move a shift that is underway or finished back to draft/published
    const row = existing && ["in_progress", "completed"].includes(existing.status)
      ? { ...rows[0], status: existing.status } : rows[0];
    const { error } = await supabase.from("shifts").update(row).eq("id", shiftId).eq("organisation_id", org.id);
    if (error) return { error: friendly(error) };
  } else {
    const { error } = await supabase.from("shifts").insert(rows.map((r) => ({ ...r, created_by: user.id })));
    if (error) return { error: friendly(error) };
  }
  revalidatePath("/roster");
  redirect(`/roster?week=${d.date}`);
}

export async function cancelShift(shiftId: string, week: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await supabase.from("shifts").update({ status: "cancelled" }).eq("id", shiftId).eq("organisation_id", org.id)
    .in("status", ["draft", "published"]);
  revalidatePath("/roster");
  redirect(`/roster?week=${week}`);
}

export async function deleteShift(shiftId: string, week: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  // Only drafts and cancelled shifts can be deleted; worked shifts are records.
  await supabase.from("shifts").delete().eq("id", shiftId).eq("organisation_id", org.id).in("status", ["draft", "cancelled"]);
  revalidatePath("/roster");
  redirect(`/roster?week=${week}`);
}

export async function publishWeek(monday: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const { start, end } = localRangeUtc(monday, 7, org.timezone);
  await supabase.from("shifts").update({ status: "published" })
    .eq("organisation_id", org.id).eq("status", "draft").gte("starts_at", start).lt("starts_at", end);
  revalidatePath("/roster");
}

/** Copy the previous week's shifts into this week as drafts (skips clashes). */
export async function copyPreviousWeek(monday: string): Promise<{ copied: number; skipped: number }> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const prev = localRangeUtc(addDaysLocal(monday, -7), 7, org.timezone);
  const { data: source } = await supabase.from("shifts")
    .select("participant_id,staff_user_id,starts_at,ends_at,break_minutes,location,instructions,plan_budget_id,support_item_code,charge_rate,service_id,estimated_rate")
    .eq("organisation_id", org.id).neq("status", "cancelled").gte("starts_at", prev.start).lt("starts_at", prev.end);

  let copied = 0, skipped = 0;
  const rows = [];
  for (const s of source ?? []) {
    // Shift by 7 local days (keeps wall-clock times across daylight saving changes)
    const st = utcToLocal(s.starts_at, org.timezone), en = utcToLocal(s.ends_at, org.timezone);
    const b = shiftBounds(addDaysLocal(st.date, 7), st.time, en.time, org.timezone);
    if (s.staff_user_id && await findClash(supabase, org.id, s.staff_user_id, b.starts_at, b.ends_at)) { skipped++; continue; }
    rows.push({ ...s, starts_at: b.starts_at, ends_at: b.ends_at, organisation_id: org.id, status: "draft", created_by: user.id });
    copied++;
  }
  // Insert one by one so a clash on one shift doesn't block the rest
  for (const r of rows) {
    const { error } = await supabase.from("shifts").insert(r);
    if (error) { copied--; skipped++; }
  }
  revalidatePath("/roster");
  return { copied, skipped };
}
