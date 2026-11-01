"use server";
import { revalidatePath } from "next/cache";
import { createCustomHostname, deleteCustomHostname, getCustomHostname, toDomainStatus } from "@/lib/cloudflare";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/org";
import { createServiceClient } from "@/lib/supabase/server";

export type DomainState = { error?: string; ok?: string } | undefined;

const HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function normalise(input: string) {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
}

// Domain columns are server-managed (see migration), so writes use the
// service client — but only after requireAdmin() has checked the caller.
async function saveDomain(orgId: string, fields: Record<string, unknown>) {
  const { error } = await createServiceClient()
    .from("organisations")
    .update({ ...fields, domain_checked_at: new Date().toISOString() })
    .eq("id", orgId);
  return error;
}

export async function connectDomain(_: DomainState, formData: FormData): Promise<DomainState> {
  const { organisation: org } = await requireAdmin();
  if (org.custom_domain) return { error: "Remove the current domain first." };
  if (!env.cloudflare()) return { error: "Custom domains aren't configured on this server yet." };

  const hostname = normalise(String(formData.get("hostname") ?? ""));
  if (!HOSTNAME.test(hostname)) return { error: "Enter a domain like portal.yourbusiness.com.au" };
  if (hostname === env.platformHost()) return { error: "That's the platform's own domain." };

  let created;
  try {
    created = await createCustomHostname(hostname);
  } catch (e) {
    return { error: `Couldn't register the domain: ${(e as Error).message}` };
  }

  const error = await saveDomain(org.id, {
    custom_domain: hostname, domain_status: toDomainStatus(created), domain_provider_id: created.id,
  });
  if (error) {
    await deleteCustomHostname(created.id).catch(() => {});
    return { error: error.code === "23505" ? "That domain is already connected to another organisation." : error.message };
  }
  revalidatePath("/admin/settings");
  return { ok: "Domain added. Now create the DNS record below." };
}

export async function refreshDomain(): Promise<DomainState> {
  const { organisation: org } = await requireAdmin();
  const { data } = await createServiceClient().from("organisations").select("domain_provider_id").eq("id", org.id).single();
  if (!data?.domain_provider_id) return { error: "No domain connected." };
  try {
    const h = await getCustomHostname(data.domain_provider_id);
    const status = toDomainStatus(h);
    await saveDomain(org.id, { domain_status: status });
    revalidatePath("/", "layout");
    const reason = h.ssl?.validation_errors?.[0]?.message ?? h.verification_errors?.[0];
    return status === "active"
      ? { ok: "Your domain is live." }
      : { ok: `Still waiting for DNS${reason ? ` (${reason})` : ""}. DNS changes can take up to a few hours.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeDomain(): Promise<DomainState> {
  const { organisation: org } = await requireAdmin();
  const { data } = await createServiceClient().from("organisations").select("domain_provider_id").eq("id", org.id).single();
  if (data?.domain_provider_id) {
    try { await deleteCustomHostname(data.domain_provider_id); } catch { /* already gone */ }
  }
  await saveDomain(org.id, { custom_domain: null, domain_status: "none", domain_provider_id: null });
  revalidatePath("/", "layout");
  return { ok: "Domain removed." };
}
