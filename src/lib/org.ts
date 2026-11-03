import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getHostTenant } from "@/lib/tenant";

export type Role = "owner" | "admin" | "coordinator" | "staff";

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  state: string;
  timezone: string;
  logo_path: string | null;
  brand_primary: string;
  brand_secondary: string;
  brand_accent: string;
  custom_domain: string | null;
  domain_status: "none" | "pending" | "active" | "error";
  subscription_status: "trialing" | "active" | "past_due" | "cancelled";
  trial_ends_at: string;
  billing_exempt: boolean;
  app_name: string | null;
  app_icon_path: string | null;
  abn: string | null;
};

export type Membership = { role: Role; organisation: Organisation };

export const ORG_COOKIE = "active_org";

export const isManager = (role: Role) => role !== "staff";
export const isAdmin = (role: Role) => role === "owner" || role === "admin";

/** Signed-in user, or null (no redirect). */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
});

/** Signed-in user or redirect to /login. */
export const requireUser = cache(async () => {
  const { supabase, user } = await getAuthUser();
  if (!user) redirect("/login");
  return { supabase, user };
});

/** All active memberships of the current user. */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("org_members")
    .select("role, organisation:organisations(id,name,slug,state,timezone,logo_path,brand_primary,brand_secondary,brand_accent,custom_domain,domain_status,subscription_status,trial_ends_at,billing_exempt,app_name,app_icon_path,abn)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
});

/** The organisation the user is currently working in. On a customer's own
 *  domain it is always that organisation; on the platform domain it is the
 *  cookie-selected one. */
export const requireMembership = cache(async (): Promise<Membership> => {
  const memberships = await getMemberships();
  const tenant = await getHostTenant();
  if (tenant) {
    const m = memberships.find((x) => x.organisation.id === tenant.id);
    if (!m) redirect("/no-access");
    return m;
  }
  if (memberships.length === 0) redirect("/signup");
  const selected = (await cookies()).get(ORG_COOKIE)?.value;
  return memberships.find((m) => m.organisation.id === selected) ?? memberships[0];
});

export async function requireManager() {
  const m = await requireMembership();
  if (!isManager(m.role)) redirect("/dashboard");
  return m;
}

export async function requireAdmin() {
  const m = await requireMembership();
  if (!isAdmin(m.role)) redirect("/dashboard");
  return m;
}

export function logoUrl(org: Pick<Organisation, "logo_path">) {
  return assetUrl(org.logo_path);
}

export type AppBranding = {
  id: string | null; name: string; appName: string; brandPrimary: string;
  logoUrl: string | null; iconUrl: string | null;
};

const PLATFORM_BRANDING: AppBranding = {
  id: null, name: "Hoiva", appName: "Hoiva", brandPrimary: "#11606B", logoUrl: null, iconUrl: null,
};

/** Branding for the installed app and page chrome, without redirecting:
 *  the customer's domain → that organisation; signed in → their current
 *  organisation; otherwise the platform's own (Hoiva) branding. */
export const getAppBranding = cache(async (): Promise<AppBranding> => {
  type B = { id: string; name: string; logo_path: string | null; brand_primary: string; app_name: string | null; app_icon_path: string | null };
  let org: B | null = await getHostTenant();
  if (!org) {
    const { user } = await getAuthUser();
    if (user) {
      const memberships = await getMemberships();
      const selected = (await cookies()).get(ORG_COOKIE)?.value;
      org = (memberships.find((m) => m.organisation.id === selected) ?? memberships[0])?.organisation ?? null;
    }
  }
  if (!org) return PLATFORM_BRANDING;
  return {
    id: org.id, name: org.name, appName: org.app_name || org.name, brandPrimary: org.brand_primary,
    logoUrl: logoUrl(org), iconUrl: assetUrl(org.app_icon_path),
  };
});

export function assetUrl(path: string | null | undefined) {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/org-assets/${path}` : null;
}
