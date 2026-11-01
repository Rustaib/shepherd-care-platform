"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/org";

export async function saveProfile(_: { error?: string; ok?: string } | undefined, formData: FormData) {
  const { supabase, user } = await requireUser();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (full_name.length < 2) return { error: "Enter your full name." };
  const { error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}
