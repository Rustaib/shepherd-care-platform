import { displayName } from "@/lib/ndis";
import { requireMembership, requireUser } from "@/lib/org";
import { todayIn } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { IncidentForm } from "../incident-form";

export const metadata = { title: "Report an incident" };

export default async function NewIncident({ searchParams }: { searchParams: Promise<{ shift?: string }> }) {
  const { shift } = await searchParams;
  const { organisation: org } = await requireMembership();
  const { supabase, user } = await requireUser();
  const [{ data: s }, { data: people }] = await Promise.all([
    shift ? supabase.from("shifts").select("id,participant_id,location,staff_user_id").eq("id", shift).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("participants").select("id,first_name,last_name,preferred_name").eq("organisation_id", org.id).neq("status", "archived").order("last_name"),
  ]);
  const ownShift = s && s.staff_user_id === user.id ? s : null;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Report an incident</h1>
      <IncidentForm shiftId={ownShift?.id ?? null} defaultParticipant={ownShift?.participant_id} location={ownShift?.location}
        participants={(people ?? []).map((p) => ({ id: p.id, name: displayName(p) }))}
        date={todayIn(org.timezone)} time={formatInTimeZone(new Date(), org.timezone, "HH:mm")} />
      <p className="text-xs text-muted">Your report goes to managers and is kept in the incident register.</p>
    </div>
  );
}
