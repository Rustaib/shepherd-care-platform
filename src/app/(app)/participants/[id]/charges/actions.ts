"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireUser } from "@/lib/org";
import { isValidDate } from "@/lib/time";

export type ChargeState = { error?: string; ok?: boolean } | undefined;

const date = z.string().trim().refine((v) => v === "" || isValidDate(v), "Enter a valid date");
const schema = z.object({
  service_id: z.string().uuid().or(z.literal("")).transform((v) => v || null),
  description: z.string().trim().max(120).transform((v) => v || null),
  frequency: z.enum(["week", "month"]),
  amount: z.string().trim().transform((v) => Number(v.replace(/[$,]/g, ""))).refine((n) => Number.isFinite(n) && n >= 0, "Enter the amount"),
  support_item_code: z.string().trim().toUpperCase().refine((v) => v === "" || /^[0-9A-Z_]{4,30}$/.test(v), "Item codes look like 01_821_0115_1_1").transform((v) => v || null),
  start_date: date.refine((v) => v !== "", "Choose a start date"),
  end_date: date.transform((v) => v || null),
});

export async function saveCharge(participantId: string, chargeId: string | null, _: ChargeState, formData: FormData): Promise<ChargeState> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.end_date && d.end_date < d.start_date) return { error: "The end date is before the start date." };
  if (!d.support_item_code && d.service_id) {
    const { data: s } = await supabase.from("services").select("weekday_code").eq("id", d.service_id).maybeSingle();
    if (!s?.weekday_code) return { error: "That service has no item code — enter one here." };
  } else if (!d.support_item_code) return { error: "Choose a service or enter an NDIS item code." };

  if (chargeId) {
    // Invoices already generated keep their own copy of the lines, so editing only affects future invoices
    const { error } = await supabase.from("participant_charges").update(d).eq("id", chargeId).eq("organisation_id", org.id).eq("participant_id", participantId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("participant_charges").insert({ ...d, organisation_id: org.id, participant_id: participantId, created_by: user.id });
    if (error) return { error: error.message };
  }
  revalidatePath(`/participants/${participantId}`);
  return { ok: true };
}

export async function deleteCharge(participantId: string, chargeId: string): Promise<ChargeState> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const { count } = await supabase.from("invoice_lines").select("id", { count: "exact", head: true }).eq("charge_id", chargeId);
  if (count) return { error: "This charge is on invoices, so it can't be deleted. Set an end date instead." };
  const { error } = await supabase.from("participant_charges").delete().eq("id", chargeId).eq("organisation_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/participants/${participantId}`);
  return { ok: true };
}
