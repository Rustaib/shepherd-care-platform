import { env } from "@/lib/env";
import type { Organisation } from "@/lib/org";

export type Access = { allowed: boolean; reason: "no_billing" | "exempt" | "active" | "trial" | "grace" | "trial_over" | "cancelled"; trialDaysLeft?: number };

/** Can this organisation use the platform right now? */
export function billingAccess(org: Pick<Organisation, "subscription_status" | "trial_ends_at" | "billing_exempt">): Access {
  if (!env.stripe()) return { allowed: true, reason: "no_billing" };
  if (org.billing_exempt) return { allowed: true, reason: "exempt" };
  if (org.subscription_status === "active") return { allowed: true, reason: "active" };
  if (org.subscription_status === "past_due") return { allowed: true, reason: "grace" };
  if (org.subscription_status === "trialing") {
    const days = Math.ceil((Date.parse(org.trial_ends_at) - Date.now()) / 864e5);
    return days > 0 ? { allowed: true, reason: "trial", trialDaysLeft: days } : { allowed: false, reason: "trial_over" };
  }
  return { allowed: false, reason: "cancelled" };
}
