import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type HostTenant = {
  id: string; name: string; logo_path: string | null;
  brand_primary: string; brand_secondary: string; brand_accent: string;
  app_name: string | null; app_icon_path: string | null;
};

/** Current request hostname, without port. */
export const getHost = cache(async () => {
  const h = await headers();
  return (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase();
});

/** The organisation that owns the hostname being visited, or null on the
 *  platform's own domain. Lets each customer's domain show their branding. */
export const getHostTenant = cache(async (): Promise<HostTenant | null> => {
  const host = await getHost();
  if (!host || host === env.platformHost().split(":")[0] || host === "localhost" || host === "127.0.0.1") return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("org_by_host", { p_host: host });
  return (data as HostTenant[] | null)?.[0] ?? null;
});

/** Base URL for links to an organisation's portal (its own domain if active). */
export function portalUrl(org: { custom_domain?: string | null; domain_status?: string | null }) {
  return org.custom_domain && org.domain_status === "active" ? `https://${org.custom_domain}` : env.appUrl();
}
