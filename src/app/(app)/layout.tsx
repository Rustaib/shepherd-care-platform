import Link from "next/link";
import { BottomNav, SideNav, type NavItem } from "@/components/nav";
import { OrgSwitcher } from "@/components/org-switcher";
import { brandStyle } from "@/lib/brand";
import { getMemberships, isAdmin, isManager, logoUrl, requireMembership } from "@/lib/org";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, organisation: org } = await requireMembership();
  const memberships = await getMemberships();
  const logo = logoUrl(org);

  const items: NavItem[] = [{ href: "/dashboard", label: "Home", icon: "home" }];
  if (isManager(role)) items.push({ href: "/admin/staff", label: "Staff", icon: "users" });
  if (isAdmin(role)) items.push({ href: "/admin/settings", label: "Settings", icon: "settings" });

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
            <OrgSwitcher current={org.id} options={memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name }))} />
            <form action="/auth/signout" method="post">
              <button className="btn-ghost px-3 py-1.5">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        {items.length > 1 && <aside className="hidden w-52 shrink-0 md:block"><SideNav items={items} /></aside>}
        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>
      {items.length > 1 && <BottomNav items={items} />}
    </div>
  );
}
