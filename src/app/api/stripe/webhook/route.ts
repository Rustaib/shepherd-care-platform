import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { mapSubscriptionStatus, verifyStripeSignature } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

type Sub = { id: string; customer: string; status: string; current_period_end?: number; items?: { data: { current_period_end?: number }[] }; metadata?: { organisation_id?: string } };

export async function POST(request: NextRequest) {
  const cfg = env.stripe();
  const payload = await request.text();
  if (!cfg || !(await verifyStripeSignature(payload, request.headers.get("stripe-signature"), cfg.webhookSecret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const admin = createServiceClient();

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as { customer: string; subscription: string; client_reference_id?: string };
    if (s.client_reference_id) {
      await admin.from("organisations").update({
        stripe_customer_id: s.customer, stripe_subscription_id: s.subscription, subscription_status: "active",
      }).eq("id", s.client_reference_id);
    }
  }

  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as unknown as Sub;
    const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    const update = {
      stripe_subscription_id: sub.id,
      subscription_status: event.type === "customer.subscription.deleted" ? "cancelled" : mapSubscriptionStatus(sub.status),
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    };
    const q = admin.from("organisations").update(update);
    await (sub.metadata?.organisation_id ? q.eq("id", sub.metadata.organisation_id) : q.eq("stripe_customer_id", sub.customer));
  }

  return NextResponse.json({ received: true });
}
