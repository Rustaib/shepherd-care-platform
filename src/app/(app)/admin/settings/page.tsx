import { logoUrl, requireAdmin } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { organisation } = await requireAdmin();
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations")
    .select("name,abn,ndis_registration_number,state,brand_primary,brand_secondary,brand_accent")
    .eq("id", organisation.id).single();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsForm org={org!} logo={logoUrl(organisation)} />
    </div>
  );
}
