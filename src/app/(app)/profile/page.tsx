import { PushToggle } from "@/components/push-toggle";
import { env } from "@/lib/env";
import { isAdmin, isManager, requireMembership, requireUser } from "@/lib/org";
import { NotificationsForm } from "./notifications-form";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My profile" };

export default async function Profile() {
  const { supabase, user } = await requireUser();
  const { role, organisation: org } = await requireMembership();
  const [{ data: p }, { data: m }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,email").eq("id", user.id).single(),
    isManager(role)
      ? supabase.from("org_members").select("notify_progress_notes,notify_expenses,notify_travel,notify_incidents")
          .eq("organisation_id", org.id).eq("user_id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);
  const byDefault = isAdmin(role); // null = default: on for owners/admins, off for coordinators
  const values = m ? {
    progress_notes: m.notify_progress_notes ?? byDefault,
    expenses: m.notify_expenses ?? byDefault,
    travel: m.notify_travel ?? byDefault,
    incidents: m.notify_incidents ?? byDefault,
  } : null;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
      <ProfileForm name={p?.full_name ?? ""} phone={p?.phone ?? ""} email={p?.email ?? user.email ?? ""} />
      {values && <NotificationsForm values={values} orgName={org.name} />}
      <PushToggle vapidKey={env.vapid()?.publicKey ?? null} />
    </div>
  );
}
