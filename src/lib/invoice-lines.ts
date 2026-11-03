import { formatInTimeZone } from "date-fns-tz";
import { classifyShift, PAY_CATEGORIES, type PayCategory } from "./payroll.ts";

/** A price-list entry: NDIS support item + rate for each time of day. */
export type Service = {
  id: string; name: string; category_label: string | null; unit: "Hours" | "Each";
  weekday_code: string | null; weekday_rate: number | null;
  evening_code: string | null; evening_rate: number | null;
  night_code: string | null; night_rate: number | null;
  saturday_code: string | null; saturday_rate: number | null;
  sunday_code: string | null; sunday_rate: number | null;
  public_holiday_code: string | null; public_holiday_rate: number | null;
  travel_code: string | null;
};

export type BillableShift = {
  id: string; starts_at: string; ends_at: string; break_minutes: number;
  extra_minutes: number;            // approved extra time
  km: number;                       // approved kilometres
  support_item_code: string | null; // per-shift override
  charge_rate: number | null;       // per-shift override
  service: Service | null;
};

export type Line = {
  kind: "service" | "travel"; shift_id: string; service_date: string; description: string;
  support_item_code: string | null; unit: string; quantity: number; unit_price: number; tax: number; amount: number;
};

export type LineOptions = { tz: string; holidays: Set<string>; participantName: string; lineFormat: string; kmRate: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const CATEGORY_LABEL: Record<PayCategory, string> = {
  weekday: "weekday daytime", evening: "weekday evening", night: "weekday night",
  saturday: "Saturday", sunday: "Sunday", public_holiday: "public holiday",
};

export function serviceLabel(s: Pick<Service, "name" | "category_label">) {
  return s.category_label ? `${s.category_label} ${s.name}` : s.name;
}

/** Fill a description template, e.g. "{participant} @ {date} {start} - {end} [{service}] [{code}]". */
export function describe(format: string, values: Record<string, string>) {
  return format.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m)).replace(/\s+\[\]/g, "").trim();
}

/** Turn one worked shift into invoice lines.
 *  - A per-shift item code + rate overrides the price list (one line).
 *  - Otherwise hours are split by time of day (weekday / evening / night /
 *    Saturday / Sunday / public holiday, as in payroll) and priced from the
 *    shift's service — one line per part.
 *  - Approved kilometres become a provider-travel line at the km rate. */
export function linesForShift(shift: BillableShift, o: LineOptions): { lines: Line[]; problems: string[] } {
  const lines: Line[] = [];
  const problems: string[] = [];
  const date = formatInTimeZone(shift.starts_at, o.tz, "yyyy-MM-dd");
  const end = new Date(Date.parse(shift.ends_at) + shift.extra_minutes * 60e3).toISOString();
  const base = {
    participant: o.participantName,
    date: formatInTimeZone(shift.starts_at, o.tz, "dd/MM/yyyy"),
    start: formatInTimeZone(shift.starts_at, o.tz, "hh:mm a").toUpperCase(),
    end: formatInTimeZone(end, o.tz, "hh:mm a").toUpperCase(),
  };
  const totalHours = Math.max(0, (Date.parse(end) - Date.parse(shift.starts_at)) / 36e5 - shift.break_minutes / 60);
  const svc = shift.service;
  const serviceName = svc ? serviceLabel(svc) : "";

  if (shift.support_item_code && shift.charge_rate != null) {
    const qty = round2(totalHours);
    lines.push({
      kind: "service", shift_id: shift.id, service_date: date,
      description: describe(o.lineFormat, { ...base, service: serviceName, code: shift.support_item_code, hours: qty.toFixed(2) }),
      support_item_code: shift.support_item_code, unit: "Hours", quantity: qty, unit_price: shift.charge_rate, tax: 0,
      amount: round2(qty * shift.charge_rate),
    });
  } else if (!svc) {
    problems.push(`${base.date} ${base.start}: no service or price set on the shift`);
  } else if (svc.unit === "Each") {
    if (!svc.weekday_code || svc.weekday_rate == null) problems.push(`${base.date}: "${svc.name}" has no item code or price`);
    else lines.push({
      kind: "service", shift_id: shift.id, service_date: date,
      description: describe(o.lineFormat, { ...base, service: serviceName, code: svc.weekday_code, hours: "1" }),
      support_item_code: svc.weekday_code, unit: "Each", quantity: 1, unit_price: svc.weekday_rate, tax: 0, amount: round2(svc.weekday_rate),
    });
  } else {
    const buckets = classifyShift({ ...shift, extra_minutes: shift.extra_minutes }, o.tz, o.holidays);
    for (const cat of PAY_CATEGORIES) {
      const qty = round2(buckets[cat]);
      if (qty <= 0) continue;
      const code = svc[`${cat}_code` as keyof Service] as string | null;
      const rate = svc[`${cat}_rate` as keyof Service] as number | null;
      if (!code || rate == null) {
        problems.push(`${base.date} ${base.start}: "${svc.name}" has no ${CATEGORY_LABEL[cat]} item code or rate`);
        continue;
      }
      lines.push({
        kind: "service", shift_id: shift.id, service_date: date,
        description: describe(o.lineFormat, { ...base, service: serviceName, code, hours: qty.toFixed(2) }),
        support_item_code: code, unit: "Hours", quantity: qty, unit_price: Number(rate), tax: 0, amount: round2(qty * Number(rate)),
      });
    }
  }

  if (shift.km > 0) {
    const code = svc?.travel_code;
    if (!code) problems.push(`${base.date}: ${shift.km} km not billed — the service has no travel item code`);
    else {
      const km = round2(shift.km);
      lines.push({
        kind: "travel", shift_id: shift.id, service_date: date,
        description: `${describe(o.lineFormat, { ...base, service: serviceName, code, hours: "" })} ${km}km $${o.kmRate.toFixed(2)}/km`,
        support_item_code: code, unit: "km", quantity: km, unit_price: o.kmRate, tax: 0, amount: round2(km * o.kmRate),
      });
    }
  }
  return { lines, problems };
}

export const totals = (lines: Pick<Line, "amount" | "tax">[]) => {
  const subtotal = round2(lines.reduce((t, l) => t + Number(l.amount), 0));
  const tax = round2(lines.reduce((t, l) => t + Number(l.tax), 0));
  return { subtotal, tax, total: round2(subtotal + tax) };
};
