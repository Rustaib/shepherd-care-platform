"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconName, NavItem } from "@/lib/nav";

const ICONS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  person: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8 9a8 8 0 0 1 16 0",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm13 9v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4l3 2",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  card: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm-1 4h20",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

function Badge({ n }: { n?: number }) {
  return n ? <span className="ml-auto rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-5 text-white">{n > 99 ? "99+" : n}</span> : null;
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  let lastSection: string | undefined;
  return (
    <nav className="flex flex-col gap-1">
      {items.map((i) => {
        const heading = i.section !== lastSection ? i.section : undefined;
        lastSection = i.section;
        return (
          <div key={i.href}>
            {heading && <div className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{heading}</div>}
            <Link href={i.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive(path, i.href) ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface hover:text-ink"}`}>
              <Icon name={i.icon} />{i.label}<Badge n={i.badge} />
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Thumb-reachable tab bar for phones: primary items plus "More". */
export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const primary = items.filter((i) => i.primary);
  const hasMore = items.length > primary.length;
  const tabs = [...primary, ...(hasMore ? [{ href: "/more", label: "More", icon: "more" as const, badge: items.filter((i) => !i.primary).reduce((t, i) => t + (i.badge ?? 0), 0) }] : [])];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-lg justify-around">
        {tabs.map((i) => (
          <li key={i.href} className="flex-1">
            <Link href={i.href} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive(path, i.href) ? "text-brand" : "text-muted"}`}>
              <Icon name={i.icon} />{i.label}
              {!!i.badge && <span className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-danger" />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
