"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AU_STATES } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const opt = z.string().trim().transform((v) => v || null);
const participantSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  preferred_name: opt,
  ndis_number: z.string().trim().transform((v) => v.replace(/\s/g, "")).refine((v) => v === "" || /^\d{9}$/.test(v), "NDIS number must be 9 digits").transform((v) => v || null),
  date_of_birth: z.string().trim().refine((v) => v === "" || !isNaN(Date.parse(v)), "Invalid date").transform((v) => v || null),
  phone: opt,
  email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Invalid email").transform((v) => v || null),
  address_line1: opt,
  address_line2: opt,
  suburb: opt,
  state: z.enum(AU_STATES).or(z.literal("")).transform((v) => v || null),
  postcode: z.string().trim().refine((v) => v === "" || /^\d{4}$/.test(v), "Postcode must be 4 digits").transform((v) => v || null),
  emergency_contact_name: opt,
  emergency_contact_phone: opt,
  emergency_contact_relationship: opt,
  support_notes: opt,
  support_coordinator_name: opt,
  support_coordinator_email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Invalid email").transform((v) => v || null),
  management_type: z.enum(["ndia_managed", "plan_managed", "self_managed"]).or(z.literal("")).transform((v) => v || null),
  invoice_emails: z.string().trim().refine((v) => v === "" || v.split(/[,;\s]+/).filter(Boolean).every((e) => z.email().safeParse(e).success), "Check the extra invoice emails").transform((v) => v || null),
});

type ParsedParticipant = z.infer<typeof participantSchema>;

function parse(formData: FormData): { data: ParsedParticipant; error?: undefined } | { data?: undefined; error: FormState } {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = participantSchema.safeParse(raw);
  if (parsed.success) return { data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { error: { error: "Please fix the highlighted fields.", fieldErrors } };
}

const dupMessage = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "Another participant already has that NDIS number." : e.message;

export async function createParticipant(_: FormState, formData: FormData): Promise<FormState> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const res = parse(formData);
  if (!res.data) return res.error;
  const { data, error } = await supabase.from("participants")
    .insert({ ...res.data, organisation_id: org.id, created_by: user.id }).select("id").single();
  if (error) return { error: dupMessage(error) };
  revalidatePath("/participants");
  redirect(`/participants/${data.id}`);
}

export async function updateParticipant(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const res = parse(formData);
  if (!res.data) return res.error;
  const { error } = await supabase.from("participants").update(res.data).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: dupMessage(error) };
  revalidatePath(`/participants/${id}`);
  revalidatePath("/participants");
  redirect(`/participants/${id}`);
}

export async function setParticipantStatus(id: string, status: "active" | "inactive" | "archived") {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await supabase.from("participants").update({ status }).eq("id", id).eq("organisation_id", org.id);
  revalidatePath(`/participants/${id}`);
  revalidatePath("/participants");
}
