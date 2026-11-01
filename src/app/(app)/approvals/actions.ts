"use server";
import { revalidatePath } from "next/cache";
import { requireManager, requireUser } from "@/lib/org";

type Table = "expense_claims" | "travel_logs" | "timesheet_adjustments";
const TABLES: Table[] = ["expense_claims", "travel_logs", "timesheet_adjustments"];

export async function reviewClaim(table: Table, id: string, status: "approved" | "rejected", notes: string) {
  await requireManager();
  if (!TABLES.includes(table)) return { error: "Unknown claim type" };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("review_claim", { p_table: table, p_id: id, p_status: status, p_notes: notes.trim() || null });
  revalidatePath("/approvals");
  return error ? { error: error.message } : { ok: true };
}

export async function approveAll(table: Table, ids: string[]) {
  await requireManager();
  if (!TABLES.includes(table)) return;
  const { supabase } = await requireUser();
  for (const id of ids.slice(0, 200)) {
    await supabase.rpc("review_claim", { p_table: table, p_id: id, p_status: "approved", p_notes: null });
  }
  revalidatePath("/approvals");
}
