import { notFound } from "next/navigation";
import { requireManager, requireUser } from "@/lib/org";
import { displayName } from "@/lib/ndis";
import { updateParticipant } from "../../actions";
import { ParticipantForm } from "../../participant-form";

export const metadata = { title: "Edit participant" };

export default async function EditParticipant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireManager();
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("participants").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Edit {displayName(p)}</h1>
      <ParticipantForm action={updateParticipant.bind(null, id)} participant={p} cancelHref={`/participants/${id}`} />
    </div>
  );
}
