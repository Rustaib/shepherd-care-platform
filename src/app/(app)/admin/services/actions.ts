"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManager, requireUser } from "@/lib/org";

export type ServiceState = { error?: string } | undefined;

const BANDS = ["weekday", "evening", "night", "saturday", "sunday", "public_holiday"] as const;
const code = z.string().trim().toUpperCase().refine((v) => v === "" || /^[0-9A-Z_]{4,30}$/.test(v), "Item codes look like 01_011_0107_1_1").transform((v) => v || null);
const rate = z.string().trim().transform((v) => v.replace(/[$,]/g, "")).refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "Rates must be numbers").transform((v) => (v === "" ? null : Number(v)));

const schema = z.object({
  name: z.string().trim().min(2, "Name the service").max(120),
  category_label: z.string().trim().max(10).transform((v) => v || null),
  unit: z.enum(["Hours", "Each"]),
  travel_code: code,
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

/** Common NDIS supports to start from. Codes and rates come from a provider's
 *  current invoices; blanks must be filled from the NDIS Pricing Arrangements. */
export async function addStandardServices() {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const rows = [
    {
      name: "Assistance With Self Care Activities Standard", category_label: "01", unit: "Hours", sort_order: 1,
      weekday_code: "01_011_0107_1_1", weekday_rate: 73.58, evening_code: "01_015_0107_1_1", evening_rate: 81.07,
      night_code: "01_002_0107_1_1", night_rate: null, saturday_code: "01_013_0107_1_1", saturday_rate: 103.54,
      sunday_code: "01_014_0107_1_1", sunday_rate: 133.5, public_holiday_code: "01_012_0107_1_1", public_holiday_rate: null,
      travel_code: "01_799_0107_1_1",
    },
    {
      name: "Access Community Social And Rec Activ Standard", category_label: "04", unit: "Hours", sort_order: 2,
      weekday_code: "04_104_0125_6_1", weekday_rate: 73.58, evening_code: "04_103_0125_6_1", evening_rate: 81.07,
      night_code: null, night_rate: null, saturday_code: null, saturday_rate: null,
      sunday_code: "04_106_0125_6_1", sunday_rate: 133.5, public_holiday_code: null, public_holiday_rate: null,
      travel_code: "04_799_0125_6_1",
    },
    {
      name: "House Cleaning And Other Household Activities", category_label: "01", unit: "Hours", sort_order: 3,
      ...Object.fromEntries(BANDS.flatMap((b) => [[`${b}_code`, "01_020_0120_1_1"], [`${b}_rate`, 60.1]])),
      travel_code: null,
    },
  ].map((r) => ({ ...r, organisation_id: org.id }));
  await supabase.from("services").upsert(rows, { onConflict: "organisation_id,name", ignoreDuplicates: true });
  revalidatePath("/admin/services");
}

export async function deleteService(id: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await supabase.from("services").delete().eq("id", id).eq("organisation_id", org.id);
  revalidatePath("/admin/services");
  redirect("/admin/services");
}
