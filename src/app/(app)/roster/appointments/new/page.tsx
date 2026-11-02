import { requireManager, requireUser } from "@/lib/org";
import { isValidDate, mondayOf, todayIn, utcToLocal } from "@/lib/time";
import { getRosterOptions } from "../../options";
import { saveAppointment } from "../actions";
import { AppointmentForm } from "../appointment-form";

export const metadata = { title: "New appointment" };

export default async function NewAppointment({ searchParams }: { searchParams: Promise<{ date?: string; participant?: string; shift?: string }> }) {
  const sp = await searchParams;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const { participants } = await getRosterOptions(org.id, org.timezone);
  // Started from a shift: pre-fill its participant, day, start time and link
  const { data: shift } = sp.shift
    ? await supabase.from("shifts").select("id,participant_id,starts_at,location").eq("id", sp.shift).eq("organisation_id", org.id).maybeSingle()
    : { data: null };
  const fromShift = shift ? utcToLocal(shift.starts_at, org.timezone) : null;
  const date = fromShift?.date ?? (sp.date && isValidDate(sp.date) ? sp.date : todayIn(org.timezone));
  const participantId = shift?.participant_id ?? sp.participant;
  const returnTo = shift ? `/roster/shifts/${shift.id}` : sp.participant ? `/participants/${sp.participant}` : null;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New appointment</h1>
      <AppointmentForm action={saveAppointment.bind(null, null, returnTo)} participants={participants}
        defaults={{ date, participant_id: participantId ?? undefined, shift_id: shift?.id, start: fromShift?.time }} cancelHref={returnTo ?? `/roster?week=${mondayOf(date)}`} />
    </div>
  );
}
