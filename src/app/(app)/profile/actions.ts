"use server";
import { revalidatePath } from "next/cache";
import { requireMembership, requireUser } from "@/lib/org";

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

export async function saveNotifications(_: { error?: string; ok?: string } | undefined, formData: FormData) {
  const { organisation: org } = await requireMembership();
  const { supabase } = await requireUser();
  const on = (k: string) => formData.get(k) === "on";
  const { error } = await supabase.rpc("set_my_notifications", {
    p_org: org.id, p_progress_notes: on("progress_notes"), p_expenses: on("expenses"),
    p_travel: on("travel"), p_incidents: on("incidents"),
  });
  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { ok: "Email preferences saved." };
}
