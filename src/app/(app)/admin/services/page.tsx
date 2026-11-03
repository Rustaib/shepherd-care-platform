import Link from "next/link";
import { money } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { PriceImport } from "./price-import";

export const metadata = { title: "Services & prices" };

const BANDS = ["weekday", "evening", "night", "saturday", "sunday", "public_holiday"] as const;
const SHORT: Record<string, string> = { weekday: "Weekday", evening: "Evening", night: "Night", saturday: "Sat", sunday: "Sun", public_holiday: "Pub hol" };

export default async function Services() {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const { data: services } = await supabase.from("services").select("*").eq("organisation_id", org.id).order("sort_order").order("name");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Services &amp; prices</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/services/new" className="btn-primary">+ Add service</Link>
        </div>
      </div>
      <p className="text-sm text-muted">Pick a service when rostering a shift and invoices use the right NDIS item and rate for when the support happened. A rate set directly on a shift overrides this list.</p>
      {!services?.length ? <p className="card text-sm text-muted">No services yet. Load the NDIS price guide below, import your own price list, or add services one by one.</p> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="p-3">Service</th>{BANDS.map((b) => <th key={b} className="p-3 text-right">{SHORT[b]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {services.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                  <td className="p-3"><Link href={`/admin/services/${s.id}`} className="font-medium text-brand underline">{s.category_label ? `${s.category_label} ` : ""}{s.name}</Link>{!s.active && <span className="ml-2 badge">Hidden</span>}<div className="text-xs text-muted">{s.unit === "Each" ? "Fixed price" : "Per hour"}{s.effective_from ? ` · from ${s.effective_from.split("-").reverse().join("/")}` : ""}</div></td>
                  {BANDS.map((b) => {
                    const missing = !s[`${b}_code`] || s[`${b}_rate`] == null;
                    return <td key={b} className={`p-3 text-right tabular-nums ${missing ? "text-danger" : ""}`} title={s[`${b}_code`] ?? "No item code"}>{s[`${b}_rate`] != null ? money(s[`${b}_rate`]) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PriceImport hasServices={!!services?.length} />
      <p className="text-xs text-muted">A red &quot;—&quot; means that time of day has no price yet. Shifts falling then are flagged when you generate invoices instead of being billed at a guessed rate.</p>
    </div>
  );
}
