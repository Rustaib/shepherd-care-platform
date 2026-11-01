"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SUPPORT_CATEGORIES } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";

export type PlanState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const schema = z.object({
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  management_type: z.enum(["ndia_managed", "plan_managed", "self_managed"]),
  plan_manager_name: z.string().trim().transform((v) => v || null),
  plan_manager_email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Invalid email").transform((v) => v || null),
  goals: z.string().trim().transform((v) => v || null),
  status: z.enum(["draft", "active", "expired"]),
}).refine((d) => d.end_date > d.start_date, { message: "End date must be after start date", path: ["end_date"] });

export async function savePlan(participantId: string, planId: string | null, _: PlanState, formData: FormData): Promise<PlanState> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  // Budget amounts: blank = no budget for that category
  const budgets: { category: string; amount: number }[] = [];
  for (const category of SUPPORT_CATEGORIES) {
    const raw = String(formData.get(`budget_${category}`) ?? "").replace(/[$,\s]/g, "");
    if (!raw) continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) return { error: "Budget amounts must be positive numbers.", fieldErrors: { [`budget_${category}`]: "Invalid amount" } };
    budgets.push({ category, amount: Math.round(amount * 100) / 100 });
  }

  const plan = { ...parsed.data, organisation_id: org.id, participant_id: participantId };
  const { data: saved, error } = planId
    ? await supabase.from("ndis_plans").update(plan).eq("id", planId).eq("organisation_id", org.id).select("id").single()
    : await supabase.from("ndis_plans").insert(plan).select("id").single();
  if (error || !saved) return { error: error?.message ?? "Plan not found." };

  if (budgets.length) {
    const { error: bErr } = await supabase.from("plan_budgets").upsert(
      budgets.map((b) => ({ organisation_id: org.id, plan_id: saved.id, category: b.category, allocated_amount: b.amount })),
      { onConflict: "plan_id,category" },
    );
    if (bErr) return { error: bErr.message };
  }
  const keep = budgets.map((b) => b.category);
  let del = supabase.from("plan_budgets").delete().eq("plan_id", saved.id);
  if (keep.length) del = del.not("category", "in", `(${keep.join(",")})`);
  await del;

  revalidatePath(`/participants/${participantId}`);
  redirect(`/participants/${participantId}`);
}

export async function deletePlan(participantId: string, planId: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await supabase.from("ndis_plans").delete().eq("id", planId).eq("organisation_id", org.id);
  revalidatePath(`/participants/${participantId}`);
  redirect(`/participants/${participantId}`);
}
