import { formatDate } from "@/lib/ndis";
import { requireAdmin, requireUser } from "@/lib/org";
import { todayIn } from "@/lib/time";
import { removeHoliday } from "./actions";
import { AddHolidayForm } from "./add-form";

export const metadata = { title: "Public holidays" };

export default async function Holidays() {
  const { organisation: org } = await requireAdmin();
  const { supabase } = await requireUser();
  const year = todayIn(org.timezone).slice(0, 4);
  const { data } = await supabase.from("public_holidays").select("id,holiday_date,name,organisation_id")
    .eq("state", org.state).or(`organisation_id.is.null,organisation_id.eq.${org.id}`)
    .gte("holiday_date", `${year}-01-01`).order("holiday_date");
  const years = [...new Set((data ?? []).map((h) => h.holiday_date.slice(0, 4)))];
  const nextYear = String(Number(year) + 1);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Public holidays · {org.state}</h1>
      <p className="text-sm text-muted">Used to calculate public holiday hours in payroll exports. Change your state in Settings.</p>
      {!years.includes(nextYear) && (
        <div className="card border-accent/50 bg-accent/5 text-sm">No {nextYear} holidays loaded for {org.state} yet — add them below, or ask your platform provider to load them.</div>
      )}
      <AddHolidayForm />
      {years.map((y) => (
        <section key={y} className="card">
          <h2 className="mb-2 font-semibold">{y}</h2>
          <ul className="divide-y divide-line">
            {(data ?? []).filter((h) => h.holiday_date.startsWith(y)).map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-32 tabular-nums">{formatDate(h.holiday_date)}</span>
                <span className="flex-1">{h.name}</span>
                {h.organisation_id
                  ? <form action={removeHoliday.bind(null, h.id)}><button className="text-xs text-danger underline">Remove</button></form>
                  : <span className="badge">Standard</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
