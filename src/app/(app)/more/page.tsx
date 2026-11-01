import Link from "next/link";
import { Icon } from "@/components/nav";
import { buildNav } from "@/lib/nav";
import { requireMembership } from "@/lib/org";

export const metadata = { title: "More" };

export default async function More() {
  const { role } = await requireMembership();
  const items = buildNav(role);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>
      <ul className="card divide-y divide-line p-0">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex items-center gap-3 px-5 py-4 hover:bg-surface"><Icon name={i.icon} /><span className="font-medium">{i.label}</span></Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
