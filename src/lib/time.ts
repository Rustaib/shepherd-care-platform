import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** All roster dates are handled as local calendar dates ("yyyy-MM-dd") in the
 *  organisation's time zone, and converted to UTC instants only at the edges. */

/** Local date + time in `tz` → UTC ISO string. */
export function localToUtc(date: string, time: string, tz: string): string {
  return fromZonedTime(`${date}T${time}:00`, tz).toISOString();
}

/** UTC ISO → local { date, time } in `tz`. */
export function utcToLocal(iso: string, tz: string) {
  return { date: formatInTimeZone(iso, tz, "yyyy-MM-dd"), time: formatInTimeZone(iso, tz, "HH:mm") };
}

/** Today's local date in `tz`. */
export const todayIn = (tz: string) => formatInTimeZone(new Date(), tz, "yyyy-MM-dd");

/** Add days to a local date string. */
export const addDaysLocal = (date: string, n: number) => format(addDays(parseISO(date), n), "yyyy-MM-dd");

/** Monday of the week containing `date`. */
export function mondayOf(date: string) {
  const d = parseISO(date);
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return format(addDays(d, -offset), "yyyy-MM-dd");
}

/** UTC range [start, end) covering local days `from` … `from + days`. */
export function localRangeUtc(from: string, days: number, tz: string) {
  return { start: localToUtc(from, "00:00", tz), end: localToUtc(addDaysLocal(from, days), "00:00", tz) };
}

/** Shift end: if end time is at or before start time, it finishes the next day. */
export function shiftBounds(date: string, start: string, end: string, tz: string) {
  const overnight = end <= start;
  return {
    starts_at: localToUtc(date, start, tz),
    ends_at: localToUtc(overnight ? addDaysLocal(date, 1) : date, end, tz),
    overnight,
  };
}

export const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISO(s).getTime());
export const isValidTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export const dayLabel = (date: string) => format(parseISO(date), "EEE d MMM");
export const timeLabel = (iso: string, tz: string) => formatInTimeZone(iso, tz, "h:mmaaa").replace(":00", "");
