"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManager, requireUser } from "@/lib/org";
import { isValidDate, isValidTime, localToUtc, mondayOf } from "@/lib/time";

export type ApptState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const schema = z.object({
  participant_id: z.uuid("Choose a participant"),
  title: z.string().trim().min(1, "Title is required").max(200),
  date: z.string().refine(isValidDate, "Choose a date"),
  start: z.string().refine(isValidTime, "Start time required"),
  end: z.string().refine((v) => v === "" || isValidTime(v), "Invalid time"),
  location: z.string().trim().transform((v) => v || null),
  notes: z.string().trim().transform((v) => v || null),
}).refine((d) => !d.end || d.end > d.start, { message: "End must be after start", path: ["end"] });

export async function saveAppointment(id: string | null, returnTo: string | null, _: ApptState, formData: FormData): Promise<ApptState> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  const row = {
    organisation_id: org.id,
    participant_id: d.participant_id,
    title: d.title,
    starts_at: localToUtc(d.date, d.start, org.timezone),
    ends_at: d.end ? localToUtc(d.date, d.end, org.timezone) : null,
    location: d.location,
    notes: d.notes,
  };
  const { error } = id
    ? await supabase.from("appointments").update(row).eq("id", id).eq("organisation_id", org.id)
    : await supabase.from("appointments").insert({ ...row, created_by: user.id });
  if (error) return { error: error.message };
  revalidatePath("/roster");
  revalidatePath(`/participants/${d.participant_id}`);
  redirect(returnTo?.startsWith("/") ? returnTo : `/roster?week=${mondayOf(d.date)}`);
}

export async function deleteAppointment(id: string, participantId: string, week: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await supabase.from("appointments").delete().eq("id", id).eq("organisation_id", org.id);
  revalidatePath("/roster");
  revalidatePath(`/participants/${participantId}`);
  redirect(`/roster?week=${week}`);
}
