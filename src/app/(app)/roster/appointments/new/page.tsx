import { requireManager } from "@/lib/org";
import { isValidDate, mondayOf, todayIn } from "@/lib/time";
import { getRosterOptions } from "../../options";
import { saveAppointment } from "../actions";
import { AppointmentForm } from "../appointment-form";

export const metadata = { title: "New appointment" };

export default async function NewAppointment({ searchParams }: { searchParams: Promise<{ date?: string; participant?: string }> }) {
  const sp = await searchParams;
  const { organisation: org } = await requireManager();
  const { participants } = await getRosterOptions(org.id, org.timezone);
  const date = sp.date && isValidDate(sp.date) ? sp.date : todayIn(org.timezone);
  const returnTo = sp.participant ? `/participants/${sp.participant}` : null;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New appointment</h1>
      <AppointmentForm action={saveAppointment.bind(null, null, returnTo)} participants={participants}
        defaults={{ date, participant_id: sp.participant }} cancelHref={returnTo ?? `/roster?week=${mondayOf(date)}`} />
    </div>
  );
}
