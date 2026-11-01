"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/org";
import { isValidDate } from "@/lib/time";

export async function addHoliday(_: { error?: string } | undefined, formData: FormData) {
  const { organisation: org } = await requireAdmin();
  const { supabase } = await requireUser();
  const date = String(formData.get("date") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!isValidDate(date) || !name) return { error: "Enter a date and a name." };
  const { error } = await supabase.from("public_holidays").insert({ organisation_id: org.id, state: org.state, holiday_date: date, name });
  if (error) return { error: error.code === "23505" ? "That date is already a holiday." : error.message };
  revalidatePath("/admin/holidays");
  return undefined;
}

export async function removeHoliday(id: string) {
  const { organisation: org } = await requireAdmin();
  const { supabase } = await requireUser();
  await supabase.from("public_holidays").delete().eq("id", id).eq("organisation_id", org.id);
  revalidatePath("/admin/holidays");
}
