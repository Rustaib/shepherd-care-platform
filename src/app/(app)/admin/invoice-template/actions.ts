"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/org";

export type TplState = { error?: string; ok?: string } | undefined;
const opt = z.string().trim().transform((v) => v || null);

const schema = z.object({
  title: z.string().trim().min(1).max(40),
  number_prefix: z.string().trim().max(10),
  next_number: z.coerce.number().int().min(1).max(9_999_999_999),
  payment_terms_days: z.coerce.number().int().min(0).max(120),
  business_name: opt, address: opt, phone: opt,
  email: z.string().trim().refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Invoice email isn't valid").transform((v) => v || null),
  payment_details: opt, footer: opt,
  line_format: z.string().trim().min(5).max(300),
  show_tax_column: z.string().optional().transform((v) => v === "on"),
  km_rate: z.coerce.number().min(0).max(10),
  ndia_registration_number: z.string().trim().refine((v) => v === "" || /^\d{10}$/.test(v), "NDIA registration number is 10 digits").transform((v) => v || null),
  account_code: z.string().trim().min(1).max(20),
  tax_type: z.string().trim().min(1).max(60),
  email_subject: z.string().trim().min(3).max(200),
  email_body: z.string().trim().min(3).max(4000),
});

export async function saveTemplate(_: TplState, formData: FormData): Promise<TplState> {
  const { organisation: org } = await requireAdmin();
  const { supabase } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.from("invoice_settings").upsert({ organisation_id: org.id, ...parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/admin/invoice-template");
  return { ok: "Saved. New invoices use this template; use “Rebuild PDF” on an existing invoice to update it." };
}
