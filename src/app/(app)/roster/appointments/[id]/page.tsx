import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { requireManager, requireUser } from "@/lib/org";
import { mondayOf, utcToLocal } from "@/lib/time";
import { getRosterOptions } from "../../options";
import { deleteAppointment, saveAppointment } from "../actions";
import { AppointmentForm } from "../appointment-form";

export const metadata = { title: "Edit appointment" };

export default async function EditAppointment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const [{ data: a }, { participants }] = await Promise.all([
    supabase.from("appointments").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle(),
    getRosterOptions(org.id, org.timezone),
  ]);
  if (!a) notFound();
  const st = utcToLocal(a.starts_at, org.timezone);
  const week = mondayOf(st.date);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Edit appointment</h1>
      <AppointmentForm action={saveAppointment.bind(null, id, null)} participants={participants} cancelHref={`/roster?week=${week}`}
        defaults={{ ...a, date: st.date, start: st.time, end: a.ends_at ? utcToLocal(a.ends_at, org.timezone).time : "" }} />
      <form action={deleteAppointment.bind(null, id, a.participant_id, week)} className="border-t border-line pt-6">
        <ConfirmButton className="btn-ghost text-danger" message="Delete this appointment?">Delete appointment</ConfirmButton>
      </form>
    </div>
  );
}
