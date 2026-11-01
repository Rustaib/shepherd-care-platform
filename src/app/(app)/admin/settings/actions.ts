"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string; ok?: string } | undefined;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours must be hex values like #1f4e79");
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  abn: z.string().trim().regex(/^(\d\s?){11}$/, "ABN must be 11 digits").or(z.literal("")),
  ndis_registration_number: z.string().trim().max(30),
  state: z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]),
  brand_primary: hex,
  brand_secondary: hex,
  brand_accent: hex,
});

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function saveSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const { organisation: org } = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    ...parsed.data,
    abn: parsed.data.abn.replace(/\s/g, "") || null,
    ndis_registration_number: parsed.data.ndis_registration_number || null,
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type];
    if (!ext) return { error: "Logo must be a PNG, JPG or WebP image." };
    if (logo.size > 2 * 1024 * 1024) return { error: "Logo must be under 2 MB." };
    const path = `${org.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("org-assets").upload(path, logo, { contentType: logo.type, upsert: false });
    if (error) return { error: `Logo upload failed: ${error.message}` };
    update.logo_path = path;
    if (org.logo_path) await supabase.storage.from("org-assets").remove([org.logo_path]);
  }
  if (formData.get("remove_logo") === "on" && !update.logo_path) {
    if (org.logo_path) await supabase.storage.from("org-assets").remove([org.logo_path]);
    update.logo_path = null;
  }

  const { error } = await supabase.from("organisations").update(update).eq("id", org.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
