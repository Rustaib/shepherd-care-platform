import { PushToggle } from "@/components/push-toggle";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/org";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My profile" };

export default async function Profile() {
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from("profiles").select("full_name,phone,email").eq("id", user.id).single();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
      <ProfileForm name={p?.full_name ?? ""} phone={p?.phone ?? ""} email={p?.email ?? user.email ?? ""} />
      <PushToggle vapidKey={env.vapid()?.publicKey ?? null} />
    </div>
  );
}
