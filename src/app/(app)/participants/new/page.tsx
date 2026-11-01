import { requireManager } from "@/lib/org";
import { createParticipant } from "../actions";
import { ParticipantForm } from "../participant-form";

export const metadata = { title: "New participant" };

export default async function NewParticipant() {
  await requireManager();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New participant</h1>
      <ParticipantForm action={createParticipant} cancelHref="/participants" />
    </div>
  );
}
