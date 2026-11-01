import { notFound } from "next/navigation";
import { displayName } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { savePlan } from "../actions";
import { PlanForm } from "../plan-form";

export const metadata = { title: "New plan" };

export default async function NewPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireManager();
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("participants").select("first_name,last_name,preferred_name").eq("id", id).maybeSingle();
  if (!p) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New NDIS plan · {displayName(p)}</h1>
      <PlanForm action={savePlan.bind(null, id, null)} cancelHref={`/participants/${id}`} />
    </div>
  );
}
