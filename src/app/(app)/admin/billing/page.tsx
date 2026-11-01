import { billingAccess } from "@/lib/billing";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/ndis";
import { requireAdmin, requireUser } from "@/lib/org";
import { openBillingPortal, startCheckout } from "./actions";

export const metadata = { title: "Billing" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams;
  const { organisation: org } = await requireAdmin();
  const { supabase } = await requireUser();
  const cfg = env.stripe();
  const access = billingAccess(org);
  const { data } = await supabase.from("organisations").select("stripe_customer_id,current_period_end").eq("id", org.id).single();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
      {success && <div className="card border-success/40 bg-success/5 text-sm">Thanks — your subscription is being activated. This page updates within a minute.</div>}
      {!cfg ? (
        <p className="card text-sm text-muted">Billing isn&apos;t switched on for this platform.</p>
      ) : access.reason === "exempt" ? (
        <p className="card text-sm">Your organisation has complimentary access. No subscription needed.</p>
      ) : (
        <section className="card space-y-4">
          <div>
            <p className="text-sm text-muted">Subscription</p>
            <p className="text-lg font-semibold">
              {access.reason === "active" && "Active"}
              {access.reason === "trial" && `Free trial — ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? "" : "s"} left`}
              {access.reason === "trial_over" && "Trial ended"}
              {access.reason === "grace" && "Payment overdue"}
              {access.reason === "cancelled" && "Cancelled"}
            </p>
            {access.reason === "active" && data?.current_period_end && <p className="text-sm text-muted">Renews {formatDate(data.current_period_end.slice(0, 10))}</p>}
            {access.reason === "grace" && <p className="text-sm text-danger">Please update your payment details to avoid losing access.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {access.reason !== "active" && access.reason !== "grace" && (
              <form action={startCheckout}><button className="btn-primary">Subscribe</button></form>
            )}
            {data?.stripe_customer_id && (
              <form action={openBillingPortal}><button className="btn-ghost">Manage billing & invoices</button></form>
            )}
          </div>
          <p className="text-xs text-muted">Payments are processed securely by Stripe. You can cancel any time from Manage billing.</p>
        </section>
      )}
    </div>
  );
}
