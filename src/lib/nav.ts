import type { Role } from "@/lib/org";

export type IconName = "file" | "tag" | "home" | "calendar" | "person" | "users" | "settings" | "clock" | "receipt" | "alert" | "check" | "download" | "sun" | "card" | "more";
export type NavItem = { href: string; label: string; icon: IconName; primary?: boolean; badge?: number; section?: string };

/** Navigation for a role. `primary` items appear in the phone tab bar. */
export function buildNav(role: Role, counts: { approvals?: number; incidents?: number } = {}): NavItem[] {
  const manager = role !== "staff";
  const admin = role === "owner" || role === "admin";
  if (!manager) {
    return [
      { href: "/dashboard", label: "Home", icon: "home", primary: true },
      { href: "/shifts", label: "My shifts", icon: "clock", primary: true },
      { href: "/claims", label: "Claims", icon: "receipt", primary: true },
      { href: "/incidents", label: "Incidents", icon: "alert", primary: true },
      { href: "/profile", label: "My profile", icon: "person" },
    ];
  }
  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: "home", primary: true },
    { href: "/roster", label: "Roster", icon: "calendar", primary: true },
    { href: "/participants", label: "Participants", icon: "person", primary: true },
    { href: "/approvals", label: "Approvals", icon: "check", primary: true, badge: counts.approvals },
    { href: "/incidents", label: "Incidents", icon: "alert", badge: counts.incidents },
    { href: "/invoices", label: "Invoices", icon: "file" },
    { href: "/admin/exports", label: "Payroll export", icon: "download" },
    { href: "/admin/staff", label: "Staff", icon: "users" },
    { href: "/shifts", label: "My shifts", icon: "clock", section: "Me" },
    { href: "/claims", label: "My claims", icon: "receipt", section: "Me" },
    { href: "/profile", label: "My profile", icon: "person", section: "Me" },
  ];
  if (admin) {
    items.push(
      { href: "/admin/services", label: "Services & prices", icon: "tag", section: "Admin" },
      { href: "/admin/invoice-template", label: "Invoice template", icon: "file", section: "Admin" },
      { href: "/admin/holidays", label: "Public holidays", icon: "sun", section: "Admin" },
      { href: "/admin/billing", label: "Billing", icon: "card", section: "Admin" },
      { href: "/admin/settings", label: "Settings", icon: "settings", section: "Admin" },
    );
  }
  return items;
}
