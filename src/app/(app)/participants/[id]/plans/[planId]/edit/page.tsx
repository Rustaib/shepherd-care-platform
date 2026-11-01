import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { displayName } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { deletePlan, savePlan } from "../../actions";
import { PlanForm } from "../../plan-form";

export const metadata = { title: "Edit plan" };

export default async function EditPlan({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  await requireManager();
  const { supabase } = await requireUser();
  const [{ data: p }, { data: plan }] = await Promise.all([
    supabase.from("participants").select("first_name,last_name,preferred_name").eq("id", id).maybeSingle(),
    supabase.from("ndis_plans").select("*, plan_budgets(category,allocated_amount)").eq("id", planId).eq("participant_id", id).maybeSingle(),
  ]);
  if (!p || !plan) notFound();
  const budgets = Object.fromEntries(
    (plan.plan_budgets as { category: string; allocated_amount: number }[]).map((b) => [b.category, Number(b.allocated_amount)]),
  );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Edit plan · {displayName(p)}</h1>
      <PlanForm action={savePlan.bind(null, id, planId)} plan={plan} budgets={budgets} cancelHref={`/participants/${id}`} />
      <form action={deletePlan.bind(null, id, planId)} className="border-t border-line pt-6">
        <p className="mb-3 text-sm text-muted">Deleting a plan removes its budgets. Shifts linked to them are kept but unlinked.</p>
        <ConfirmButton className="btn-ghost text-danger" message="Delete this plan and its budgets? This can't be undone.">Delete plan</ConfirmButton>
      </form>
    </div>
  );
}
