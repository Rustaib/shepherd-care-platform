"use server";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { requireAdmin, requireUser } from "@/lib/org";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { portalUrl } from "@/lib/tenant";

async function ensureCustomer(orgId: string, orgName: string, email: string) {
  const admin = createServiceClient();
  const { data } = await admin.from("organisations").select("stripe_customer_id").eq("id", orgId).single();
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;
  const customer = await stripe<{ id: string }>("/customers", { name: orgName, email, "metadata[organisation_id]": orgId });
  await admin.from("organisations").update({ stripe_customer_id: customer.id }).eq("id", orgId);
  return customer.id;
}

export async function startCheckout() {
  const { organisation: org } = await requireAdmin();
  const { supabase, user } = await requireUser();
  const cfg = env.stripe();
  if (!cfg) return;
  const customer = await ensureCustomer(org.id, org.name, user.email!);
  let quantity = 1;
  if (cfg.perSeat) {
    const { count } = await supabase.from("org_members").select("*", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "active");
    quantity = Math.max(1, count ?? 1);
  }
  const base = portalUrl(org);
  const session = await stripe<{ url: string }>("/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: org.id,
    "line_items[0][price]": cfg.priceId,
    "line_items[0][quantity]": quantity,
    "subscription_data[metadata][organisation_id]": org.id,
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    success_url: `${base}/admin/billing?success=1`,
    cancel_url: `${base}/admin/billing`,
  });
  redirect(session.url);
}

export async function openBillingPortal() {
  const { organisation: org } = await requireAdmin();
  const { user } = await requireUser();
  const customer = await ensureCustomer(org.id, org.name, user.email!);
  const session = await stripe<{ url: string }>("/billing_portal/sessions", { customer, return_url: `${portalUrl(org)}/admin/billing` });
  redirect(session.url);
}
