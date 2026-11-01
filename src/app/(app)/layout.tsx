import { headers } from "next/headers";
import Link from "next/link";
import { BottomNav, SideNav } from "@/components/nav";
import { OrgSwitcher } from "@/components/org-switcher";
import { billingAccess } from "@/lib/billing";
import { brandStyle } from "@/lib/brand";
import { buildNav } from "@/lib/nav";
import { getMemberships, isAdmin, isManager, logoUrl, requireMembership, requireUser } from "@/lib/org";
import { getHostTenant } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, organisation: org } = await requireMembership();
  const memberships = await getMemberships();
  const onOwnDomain = !!(await getHostTenant());
  const logo = logoUrl(org);
  const path = (await headers()).get("x-pathname") ?? "";

  let counts = {};
  if (isManager(role)) {
    const { supabase } = await requireUser();
    const c = (table: string, f: (q: any) => any) => f(supabase.from(table).select("*", { count: "exact", head: true }).eq("organisation_id", org.id)).then((r: { count: number | null }) => r.count ?? 0); // eslint-disable-line @typescript-eslint/no-explicit-any
    const [a1, a2, a3, inc] = await Promise.all([
      c("timesheet_adjustments", (q) => q.eq("status", "pending")),
      c("expense_claims", (q) => q.eq("status", "pending")),
      c("travel_logs", (q) => q.eq("status", "pending")),
      c("incident_reports", (q) => q.eq("status", "open")),
    ]);
    counts = { approvals: a1 + a2 + a3, incidents: inc };
  }
  const items = buildNav(role, counts);

  const access = billingAccess(org);
  const locked = !access.allowed && !path.startsWith("/admin/billing");
  const showTrialBanner = isAdmin(role) && ((access.reason === "trial" && (access.trialDaysLeft ?? 99) <= 7) || access.reason === "grace");

  return (
    <div style={brandStyle(org)} className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-card/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            {logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logo} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
              : <span className="h-8 w-8 shrink-0 rounded-lg bg-brand" aria-hidden />}
            <span className="truncate font-semibold">{org.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {!onOwnDomain && <OrgSwitcher current={org.id} options={memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name }))} />}
            <form action="/auth/signout" method="post"><button className="btn-ghost px-3 py-1.5">Sign out</button></form>
          </div>
        </div>
      </header>
      {showTrialBanner && (
        <div className="border-b border-accent/40 bg-accent/10 px-4 py-2 text-center text-sm">
          {access.reason === "grace" ? "Your last payment didn't go through." : `Your free trial ends in ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? "" : "s"}.`}{" "}
          <Link href="/admin/billing" className="font-semibold underline">{access.reason === "grace" ? "Update payment" : "Subscribe"}</Link>
        </div>
      )}
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-52 shrink-0 md:block"><SideNav items={items} /></aside>
        <main className="min-w-0 flex-1 pb-24 md:pb-6">
          {locked ? (
            <div className="card mx-auto max-w-md space-y-3 text-center">
              <h1 className="text-xl font-bold">{access.reason === "trial_over" ? "Your free trial has ended" : "Subscription inactive"}</h1>
              {isAdmin(role)
                ? <><p className="text-sm text-muted">Subscribe to keep using {org.name}&apos;s portal. Your data is safe and nothing has been deleted.</p>
                    <Link href="/admin/billing" className="btn-primary">Go to billing</Link></>
                : <p className="text-sm text-muted">Please ask your administrator to renew the subscription. Your records are safe.</p>}
            </div>
          ) : children}
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
