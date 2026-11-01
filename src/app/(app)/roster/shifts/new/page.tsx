import { requireManager } from "@/lib/org";
import { isValidDate, mondayOf, todayIn } from "@/lib/time";
import { saveShift } from "../../actions";
import { getRosterOptions } from "../../options";
import { ShiftForm } from "../../shift-form";

export const metadata = { title: "New shift" };

export default async function NewShift({ searchParams }: { searchParams: Promise<{ date?: string; participant?: string; staff?: string }> }) {
  const sp = await searchParams;
  const { organisation: org } = await requireManager();
  const { staff, participants } = await getRosterOptions(org.id, org.timezone);
  const date = sp.date && isValidDate(sp.date) ? sp.date : todayIn(org.timezone);
  const p = participants.find((x) => x.id === sp.participant);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New shift</h1>
      <ShiftForm action={saveShift.bind(null, null)} isNew staff={staff} participants={participants}
        cancelHref={`/roster?week=${mondayOf(date)}`}
        defaults={{ date, participant_id: p?.id, location: p?.address, staff_user_id: sp.staff, status: "published" }} />
    </div>
  );
}
