import { assetUrl, logoUrl, requireAdmin } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { DomainForm } from "./domain-form";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { organisation } = await requireAdmin();
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations")
    .select("name,abn,ndis_registration_number,state,brand_primary,brand_secondary,brand_accent,app_name")
    .eq("id", organisation.id).single();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsForm org={org!} logo={logoUrl(organisation)} appIcon={assetUrl(organisation.app_icon_path)} />
      <DomainForm domain={organisation.custom_domain} status={organisation.domain_status}
        cnameTarget={env.cloudflare()?.cnameTarget ?? null} configured={!!env.cloudflare()} />
    </div>
  );
}
