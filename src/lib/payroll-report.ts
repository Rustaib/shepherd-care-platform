import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organisation } from "@/lib/org";
import { classifyShift, PAY_CATEGORIES, round2, sumBuckets, totalHours, type Buckets } from "@/lib/payroll";
import { localRangeUtc } from "@/lib/time";

export type PayrollRow = {
  staffId: string; name: string; email: string; shifts: number; buckets: Buckets; total: number;
  km: number; expenses: number; pendingClaims: number; notClockedOut: number;
};

/** Payroll summary for shifts that have ended within [from, to] (local dates, inclusive). */
export async function buildPayrollReport(supabase: SupabaseClient, org: Organisation, from: string, to: string, staffIds: string[]) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const { start, end } = localRangeUtc(from, days, org.timezone);
  const now = new Date().toISOString();

  let shiftQ = supabase.from("shifts")
    .select("id,staff_user_id,starts_at,ends_at,break_minutes,status,clock_out_at,timesheet_adjustments(extra_minutes,status)")
    .eq("organisation_id", org.id).not("staff_user_id", "is", null).in("status", ["published", "in_progress", "completed"])
    .gte("starts_at", start).lt("starts_at", end).lte("ends_at", now);
  let kmQ = supabase.from("travel_logs").select("staff_user_id,kilometres,status")
    .eq("organisation_id", org.id).gte("travelled_on", from).lte("travelled_on", to);
  let expQ = supabase.from("expense_claims").select("staff_user_id,amount,status")
    .eq("organisation_id", org.id).gte("incurred_on", from).lte("incurred_on", to);
  if (staffIds.length) {
    shiftQ = shiftQ.in("staff_user_id", staffIds);
    kmQ = kmQ.in("staff_user_id", staffIds);
    expQ = expQ.in("staff_user_id", staffIds);
  }

  const [{ data: shifts }, { data: km }, { data: exp }, { data: holidays }, { data: members }] = await Promise.all([
    shiftQ, kmQ, expQ,
    supabase.from("public_holidays").select("holiday_date").eq("state", org.state)
      .or(`organisation_id.is.null,organisation_id.eq.${org.id}`).gte("holiday_date", from).lte("holiday_date", to),
    supabase.from("org_members").select("user_id,profile:profiles(full_name,email)").eq("organisation_id", org.id),
  ]);

  const holidaySet = new Set((holidays ?? []).map((h) => h.holiday_date as string));
  const people = new Map(((members ?? []) as unknown as { user_id: string; profile: { full_name: string; email: string } }[])
    .map((m) => [m.user_id, m.profile]));
  const rows = new Map<string, PayrollRow>();
  const row = (id: string) => {
    if (!rows.has(id)) {
      const p = people.get(id);
      rows.set(id, { staffId: id, name: p?.full_name || p?.email || "Unknown", email: p?.email ?? "", shifts: 0,
        buckets: sumBuckets([]), total: 0, km: 0, expenses: 0, pendingClaims: 0, notClockedOut: 0 });
    }
    return rows.get(id)!;
  };

  type S = { staff_user_id: string; starts_at: string; ends_at: string; break_minutes: number; status: string; clock_out_at: string | null; timesheet_adjustments: { extra_minutes: number; status: string }[] };
  for (const s of (shifts ?? []) as S[]) {
    const r = row(s.staff_user_id);
    const extra = s.timesheet_adjustments.filter((a) => a.status === "approved").reduce((t, a) => t + a.extra_minutes, 0);
    r.pendingClaims += s.timesheet_adjustments.filter((a) => a.status === "pending").length;
    r.buckets = sumBuckets([r.buckets, classifyShift({ ...s, extra_minutes: extra }, org.timezone, holidaySet)]);
    r.shifts++;
    if (!s.clock_out_at) r.notClockedOut++;
  }
  for (const k of km ?? []) {
    const r = row(k.staff_user_id);
    if (k.status === "approved") r.km += Number(k.kilometres);
    if (k.status === "pending") r.pendingClaims++;
  }
  for (const e of exp ?? []) {
    const r = row(e.staff_user_id);
    if (e.status === "approved") r.expenses += Number(e.amount);
    if (e.status === "pending") r.pendingClaims++;
  }

  const list = [...rows.values()].map((r) => {
    for (const k of PAY_CATEGORIES) r.buckets[k] = round2(r.buckets[k]);
    return { ...r, total: round2(totalHours(r.buckets)), km: Math.round(r.km * 10) / 10, expenses: round2(r.expenses) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { rows: list, holidays: [...holidaySet].sort() };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote, and neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function payrollCsv(rows: PayrollRow[], from: string, to: string) {
  const header = ["Staff member", "Email", "Period start", "Period end", "Shifts",
    "Weekday hrs", "Weekday evening hrs", "Weekday night hrs", "Saturday hrs", "Sunday hrs", "Public holiday hrs",
    "Total hrs", "Kilometres (approved)", "Expenses $ (approved)"];
  const lines = rows.map((r) => [r.name, r.email, from, to, r.shifts,
    r.buckets.weekday, r.buckets.evening, r.buckets.night, r.buckets.saturday, r.buckets.sunday, r.buckets.public_holiday,
    r.total, r.km, r.expenses.toFixed(2)].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
