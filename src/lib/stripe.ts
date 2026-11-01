import "server-only";
import { env } from "@/lib/env";
export { verifyStripeSignature } from "@/lib/stripe-signature";

/** Minimal Stripe REST client (fetch-based, works on Cloudflare Workers). */
export async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, string | number>, method = "POST"): Promise<T> {
  const cfg = env.stripe();
  if (!cfg) throw new Error("Billing isn't configured.");
  const body = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : undefined;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : body,
  });
  const json = await res.json() as T & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  return json;
}

export function mapSubscriptionStatus(s: string): "active" | "past_due" | "cancelled" | "trialing" {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
  return "cancelled";
}
