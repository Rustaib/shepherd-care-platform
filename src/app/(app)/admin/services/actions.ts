"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManager, requireUser } from "@/lib/org";
import { parsePriceBook } from "@/lib/price-guide";
import { defaultPriceGuide, upsertServices, type ImportSummary } from "@/lib/services-import";
import { todayIn } from "@/lib/time";

export type ServiceState = { error?: string } | undefined;

const BANDS = ["weekday", "evening", "night", "saturday", "sunday", "public_holiday"] as const;
const code = z.string().trim().toUpperCase().refine((v) => v === "" || /^[0-9A-Z_]{4,30}$/.test(v), "Item codes look like 01_011_0107_1_1").transform((v) => v || null);
const rate = z.string().trim().transform((v) => v.replace(/[$,]/g, "")).refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "Rates must be numbers").transform((v) => (v === "" ? null : Number(v)));

const schema = z.object({
  name: z.string().trim().min(2, "Name the service").max(120),
  category_label: z.string().trim().max(10).transform((v) => v || null),
  unit: z.enum(["Hours", "Each"]),
  travel_code: code,
  travel_rate: rate,
  active: z.string().optional().transform((v) => v === "on"),
  ...Object.fromEntries(BANDS.flatMap((b) => [[`${b}_code`, code], [`${b}_rate`, rate]])),
});

export async function saveService(id: string | null, _: ServiceState, formData: FormData): Promise<ServiceState> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = { ...parsed.data, organisation_id: org.id };
  const { error } = id
    ? await supabase.from("services").update(row).eq("id", id).eq("organisation_id", org.id)
    : await supabase.from("services").insert(row);
  if (error) return { error: error.code === "23505" ? "A service with that name already exists." : error.message };
  revalidatePath("/admin/services");
  redirect("/admin/services");
}

export type ImportState = { ok?: string; error?: string; notes?: string[] } | undefined;

const describeSummary = (r: ImportSummary) =>
  [r.created && `${r.created} added`, r.updated && `${r.updated} updated`, r.unchanged && `${r.unchanged} left as they were`].filter(Boolean).join(", ") || "Nothing to change";

/** Load the built-in NDIS price guide: adds missing services and brings existing ones up to the current prices. */
export async function loadPriceGuide(onlyNew: boolean, _: ImportState): Promise<ImportState> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const r = await upsertServices(supabase, org.id, defaultPriceGuide(todayIn(org.timezone)), onlyNew);
  revalidatePath("/admin/services");
  return r.errors.length ? { error: r.errors[0] } : { ok: `NDIS price guide loaded: ${describeSummary(r)}.` };
}

/** Import a price book CSV (same layout as the template): creates new services and overrides matching ones. */
export async function importServices(_: ImportState, formData: FormData): Promise<ImportState> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const file = formData.get("file");
  if (!file || typeof file === "string" || typeof (file as Blob).text !== "function" || (file as Blob).size === 0) return { error: "Choose a CSV file to import." };
  if ((file as Blob).size > 2_000_000) return { error: "That file is over 2 MB — is it the right one?" };
  const text = await (file as Blob).text();
  const { services, errors } = parsePriceBook(text, todayIn(org.timezone));
  if (!services.length) return { error: errors[0] ?? "No services found in that file.", notes: errors.slice(1, 10) };
  const r = await upsertServices(supabase, org.id, services, formData.get("only_new") === "on");
  revalidatePath("/admin/services");
  const notes = [...errors, ...r.errors];
  return { ok: `Imported ${services.length} service${services.length === 1 ? "" : "s"}: ${describeSummary(r)}.`, notes: notes.slice(0, 10).concat(notes.length > 10 ? [`…and ${notes.length - 10} more`] : []) };
}

export async function deleteService(id: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await supabase.from("services").delete().eq("id", id).eq("organisation_id", org.id);
  revalidatePath("/admin/services");
  redirect("/admin/services");
}
