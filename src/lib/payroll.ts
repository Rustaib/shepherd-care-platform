import { formatInTimeZone } from "date-fns-tz";
import { addDaysLocal, localToUtc } from "./time.ts";

/** Pay categories, aligned with the SCHADS Award's shift and penalty structure.
 *  - weekday:   Mon–Fri day work
 *  - evening:   Mon–Fri shift finishing after 8pm and at or before midnight ("afternoon shift")
 *  - night:     Mon–Fri shift finishing after midnight, or starting before 6am
 *  - saturday / sunday / public_holiday: hours falling on that calendar day
 *  Weekend and public-holiday hours are split at midnight; weekday hours take
 *  the shift's classification. Confirm rates and edge cases (sleepovers,
 *  broken shifts, overtime) with your payroll provider. */
export const PAY_CATEGORIES = ["weekday", "evening", "night", "saturday", "sunday", "public_holiday"] as const;
export type PayCategory = (typeof PAY_CATEGORIES)[number];
export const PAY_LABEL: Record<PayCategory, string> = {
  weekday: "Weekday", evening: "Weekday evening", night: "Weekday night",
  saturday: "Saturday", sunday: "Sunday", public_holiday: "Public holiday",
};

export type PayShift = { starts_at: string; ends_at: string; break_minutes: number; extra_minutes?: number };
export type Buckets = Record<PayCategory, number>;

const empty = (): Buckets => ({ weekday: 0, evening: 0, night: 0, saturday: 0, sunday: 0, public_holiday: 0 });

/** Weekday classification for a whole shift. */
export function weekdayShiftType(startIso: string, endIso: string, tz: string): "weekday" | "evening" | "night" {
  const startDate = formatInTimeZone(startIso, tz, "yyyy-MM-dd");
  const startTime = formatInTimeZone(startIso, tz, "HH:mm");
  const endDate = formatInTimeZone(endIso, tz, "yyyy-MM-dd");
  const endTime = formatInTimeZone(endIso, tz, "HH:mm");
  if (startTime < "06:00") return "night";
  if (endDate > startDate) {
    // Finishing exactly at midnight counts as an evening shift
    return endTime === "00:00" && endDate === addDaysLocal(startDate, 1) ? "evening" : "night";
  }
  return endTime > "20:00" ? "evening" : "weekday";
}

/** Split one shift into pay-category hours. */
export function classifyShift(shift: PayShift, tz: string, holidays: Set<string>): Buckets {
  const out = empty();
  const start = Date.parse(shift.starts_at);
  const end = Date.parse(shift.ends_at) + (shift.extra_minutes ?? 0) * 60e3;
  if (!(end > start)) return out;
  const endIso = new Date(end).toISOString();
  const type = weekdayShiftType(shift.starts_at, endIso, tz);

  // Walk local calendar days
  let cursor = start;
  let date = formatInTimeZone(shift.starts_at, tz, "yyyy-MM-dd");
  while (cursor < end) {
    const nextMidnight = Date.parse(localToUtc(addDaysLocal(date, 1), "00:00", tz));
    const segEnd = Math.min(end, nextMidnight);
    const hours = (segEnd - cursor) / 36e5;
    const dow = Number(formatInTimeZone(new Date(cursor), tz, "i")); // 1=Mon … 7=Sun
    const cat: PayCategory = holidays.has(date) ? "public_holiday" : dow === 6 ? "saturday" : dow === 7 ? "sunday" : type;
    out[cat] += hours;
    cursor = segEnd;
    date = addDaysLocal(date, 1);
  }

  // Deduct the unpaid break proportionally across categories
  const total = (end - start) / 36e5;
  const factor = Math.max(0, total - shift.break_minutes / 60) / total;
  for (const k of PAY_CATEGORIES) out[k] *= factor;
  return out;
}

export function sumBuckets(list: Buckets[]): Buckets {
  const out = empty();
  for (const b of list) for (const k of PAY_CATEGORIES) out[k] += b[k];
  return out;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const totalHours = (b: Buckets) => PAY_CATEGORIES.reduce((t, k) => t + b[k], 0);
