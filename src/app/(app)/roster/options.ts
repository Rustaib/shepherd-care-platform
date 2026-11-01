import "server-only";
import { categoryLabel, displayName } from "@/lib/ndis";
import { requireUser } from "@/lib/org";
import { todayIn } from "@/lib/time";

export type StaffOption = { id: string; name: string };
export type ParticipantOption = { id: string; name: string; address: string; budgets: { id: string; label: string }[] };

/** Staff and participants for roster forms and filters. */
export async function getRosterOptions(orgId: string, tz: string) {
  const { supabase } = await requireUser();
  const today = todayIn(tz);
  const [{ data: members }, { data: participants }] = await Promise.all([
    supabase.from("org_members").select("user_id, profile:profiles(full_name,email)")
      .eq("organisation_id", orgId).eq("status", "active"),
    supabase.from("participants")
      .select("id,first_name,last_name,preferred_name,address_line1,suburb,ndis_plans(start_date,end_date,status,plan_budgets(id,category))")
      .eq("organisation_id", orgId).eq("status", "active").order("last_name"),
  ]);

  const staff: StaffOption[] = ((members ?? []) as unknown as { user_id: string; profile: { full_name: string; email: string } }[])
    .map((m) => ({ id: m.user_id, name: m.profile.full_name || m.profile.email }))
    .sort((a, b) => a.name.localeCompare(b.name));

  type P = { id: string; first_name: string; last_name: string; preferred_name: string | null; address_line1: string | null; suburb: string | null;
    ndis_plans: { start_date: string; end_date: string; status: string; plan_budgets: { id: string; category: string }[] }[] };
  const people: ParticipantOption[] = ((participants ?? []) as P[]).map((p) => {
    const plan = p.ndis_plans.find((pl) => pl.start_date <= today && pl.end_date >= today && pl.status !== "draft");
    return {
      id: p.id,
      name: displayName(p),
      address: [p.address_line1, p.suburb].filter(Boolean).join(", "),
      budgets: (plan?.plan_budgets ?? []).map((b) => ({ id: b.id, label: categoryLabel(b.category) })),
    };
  });
  return { staff, participants: people };
}
