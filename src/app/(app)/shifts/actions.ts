"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RECEIPT_TYPES } from "@/lib/claims";
import { requireMembership, requireUser } from "@/lib/org";
import { isValidDate } from "@/lib/time";

export type ActionResult = { error?: string; ok?: string } | undefined;

async function ownShift(shiftId: string) {
  const { organisation: org } = await requireMembership();
  const { supabase, user } = await requireUser();
  const { data: shift } = await supabase.from("shifts")
    .select("id,organisation_id,participant_id,staff_user_id,starts_at,ends_at,status")
    .eq("id", shiftId).eq("organisation_id", org.id).maybeSingle();
  if (!shift || shift.staff_user_id !== user.id) throw new Error("This isn't your shift.");
  return { supabase, user, org, shift };
}

const done = (shiftId: string, ok: string): ActionResult => { revalidatePath(`/shifts/${shiftId}`); return { ok }; };

export async function clockIn(shiftId: string, lat: number | null, lng: number | null): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("clock_in", { p_shift: shiftId, p_lat: lat, p_lng: lng });
  if (error) return { error: "You can clock in from 2 hours before the shift starts until it ends." };
  revalidatePath("/dashboard");
  return done(shiftId, "Clocked in.");
}

export async function clockOut(shiftId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("clock_out", { p_shift: shiftId });
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return done(shiftId, "Clocked out. Don't forget your progress note.");
}

export async function addNote(shiftId: string, _: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user, shift } = await ownShift(shiftId);
    if (!shift.participant_id) return { error: "This shift has no participant." };
    const body = String(formData.get("body") ?? "").trim();
    if (body.length < 10) return { error: "Please write a little more detail (at least 10 characters)." };
    const goals = formData.getAll("goals").map(String).filter(Boolean);
    const { error } = await supabase.from("progress_notes").insert({
      organisation_id: shift.organisation_id, participant_id: shift.participant_id, shift_id: shiftId,
      author_id: user.id, body, goals_addressed: goals.length ? goals : null,
    });
    if (error) return { error: error.message };
    return done(shiftId, "Progress note saved.");
  } catch (e) { return { error: (e as Error).message }; }
}

export async function updateNote(noteId: string, shiftId: string, body: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (body.trim().length < 10) return { error: "Please write a little more detail." };
  const { data, error } = await supabase.from("progress_notes").update({ body: body.trim() }).eq("id", noteId).select("id");
  if (error || !data?.length) return { error: "Notes can only be edited by their author within 24 hours." };
  return done(shiftId, "Note updated.");
}

const expenseSchema = z.object({
  category: z.string().min(1),
  amount: z.string().transform((v) => Number(v.replace(/[$,\s]/g, ""))).refine((n) => Number.isFinite(n) && n > 0 && n < 5000, "Enter an amount"),
  incurred_on: z.string().refine(isValidDate, "Choose a date"),
  description: z.string().trim().min(3, "Say what it was for"),
});

export async function addExpense(shiftId: string, _: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user, shift } = await ownShift(shiftId);
    const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    let receipt_path: string | null = null;
    const file = formData.get("receipt");
    if (file instanceof File && file.size > 0) {
      const ext = RECEIPT_TYPES[file.type];
      if (!ext) return { error: "Receipt must be a photo or PDF." };
      if (file.size > 8 * 1024 * 1024) return { error: "Receipt must be under 8 MB." };
      receipt_path = `${shift.organisation_id}/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("receipts").upload(receipt_path, file, { contentType: file.type });
      if (error) return { error: `Receipt upload failed: ${error.message}` };
    }
    const { error } = await supabase.from("expense_claims").insert({
      organisation_id: shift.organisation_id, shift_id: shiftId, participant_id: shift.participant_id,
      staff_user_id: user.id, ...parsed.data, receipt_path,
    });
    if (error) return { error: error.message };
    return done(shiftId, "Expense claim submitted.");
  } catch (e) { return { error: (e as Error).message }; }
}

const kmSchema = z.object({
  kilometres: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => Number.isFinite(n) && n > 0 && n < 2000, "Enter the kilometres"),
  travelled_on: z.string().refine(isValidDate, "Choose a date"),
  from_location: z.string().trim().transform((v) => v || null),
  to_location: z.string().trim().transform((v) => v || null),
  purpose: z.string().trim().min(3, "Say what the trip was for"),
});

export async function addKm(shiftId: string, _: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user, shift } = await ownShift(shiftId);
    const parsed = kmSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { error } = await supabase.from("travel_logs").insert({
      organisation_id: shift.organisation_id, shift_id: shiftId, participant_id: shift.participant_id,
      staff_user_id: user.id, ...parsed.data, kilometres: Math.round(parsed.data.kilometres * 10) / 10,
    });
    if (error) return { error: error.message };
    return done(shiftId, "Kilometres logged.");
  } catch (e) { return { error: (e as Error).message }; }
}

export async function requestExtraHours(shiftId: string, _: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user, shift } = await ownShift(shiftId);
    if (Date.parse(shift.starts_at) > Date.now()) return { error: "You can request extra time once the shift has started." };
    const minutes = Number(formData.get("extra_minutes"));
    const reason = String(formData.get("reason") ?? "").trim();
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) return { error: "Choose how much extra time you worked." };
    if (reason.length < 5) return { error: "Please explain why you needed the extra time." };
    const { error } = await supabase.from("timesheet_adjustments").insert({
      organisation_id: shift.organisation_id, shift_id: shiftId, staff_user_id: user.id, extra_minutes: minutes, reason,
    });
    if (error) return { error: error.code === "23505" ? "You already have a pending request for this shift." : error.message };
    return done(shiftId, "Request sent for approval.");
  } catch (e) { return { error: (e as Error).message }; }
}

export async function withdrawClaim(table: "expense_claims" | "travel_logs" | "timesheet_adjustments", id: string, path: string) {
  const { supabase } = await requireUser();
  await supabase.from(table).delete().eq("id", id).eq("status", "pending");
  revalidatePath(path);
}
