import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyShift, weekdayShiftType } from "../payroll.ts";
import { localToUtc } from "../time.ts";

const TZ = "Australia/Sydney";
const s = (date, start, endDate, end, br = 0, extra = 0) => ({
  starts_at: localToUtc(date, start, TZ), ends_at: localToUtc(endDate, end, TZ), break_minutes: br, extra_minutes: extra,
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const none = new Set();

test("weekday day shift with break", () => {
  const b = classifyShift(s("2026-11-04", "09:00", "2026-11-04", "17:00", 30), TZ, none); // Wed
  close(b.weekday, 7.5); close(b.evening, 0);
});
test("evening shift (finishes after 8pm)", () => {
  assert.equal(weekdayShiftType(localToUtc("2026-11-04", "15:00", TZ), localToUtc("2026-11-04", "21:00", TZ), TZ), "evening");
  const b = classifyShift(s("2026-11-04", "15:00", "2026-11-04", "21:00"), TZ, none);
  close(b.evening, 6);
});
test("finishing exactly 8pm is a day shift; exactly midnight is evening", () => {
  assert.equal(weekdayShiftType(localToUtc("2026-11-04", "12:00", TZ), localToUtc("2026-11-04", "20:00", TZ), TZ), "weekday");
  assert.equal(weekdayShiftType(localToUtc("2026-11-04", "16:00", TZ), localToUtc("2026-11-05", "00:00", TZ), TZ), "evening");
});
test("weeknight overnight shift is night", () => {
  const b = classifyShift(s("2026-11-04", "22:00", "2026-11-05", "07:00"), TZ, none); // Wed→Thu
  close(b.night, 9);
});
test("early start before 6am is night", () => {
  assert.equal(weekdayShiftType(localToUtc("2026-11-04", "05:00", TZ), localToUtc("2026-11-04", "11:00", TZ), TZ), "night");
});
test("Friday night into Saturday splits at midnight", () => {
  const b = classifyShift(s("2026-11-06", "22:00", "2026-11-07", "06:00"), TZ, none); // Fri→Sat
  close(b.night, 2); close(b.saturday, 6);
});
test("Saturday into Sunday", () => {
  const b = classifyShift(s("2026-11-07", "20:00", "2026-11-08", "02:00"), TZ, none);
  close(b.saturday, 4); close(b.sunday, 2);
});
test("public holiday overrides weekday and weekend", () => {
  const ph = new Set(["2026-12-25", "2026-12-26"]);
  const b = classifyShift(s("2026-12-24", "20:00", "2026-12-25", "08:00"), TZ, ph); // Thu night into Christmas
  close(b.night, 4); close(b.public_holiday, 8);
  const sat = classifyShift(s("2026-12-26", "08:00", "2026-12-26", "12:00"), TZ, ph); // Boxing Day (Sat)
  close(sat.public_holiday, 4); close(sat.saturday, 0);
});
test("approved extra minutes extend the shift", () => {
  const b = classifyShift(s("2026-11-04", "09:00", "2026-11-04", "15:00", 0, 45), TZ, none);
  close(b.weekday, 6.75);
});
test("extra time pushing past 8pm reclassifies as evening", () => {
  const b = classifyShift(s("2026-11-04", "14:00", "2026-11-04", "20:00", 0, 30), TZ, none);
  close(b.evening, 6.5); close(b.weekday, 0);
});
test("break deducted proportionally across split days", () => {
  const b = classifyShift(s("2026-11-07", "20:00", "2026-11-08", "04:00", 60), TZ, none); // 4h Sat + 4h Sun, 1h break
  close(b.saturday, 3.5); close(b.sunday, 3.5);
});
test("DST start night (clocks forward 2am 4 Oct 2026, a Sunday)", () => {
  const b = classifyShift(s("2026-10-03", "22:00", "2026-10-04", "06:00"), TZ, none);
  close(b.saturday, 2); close(b.sunday, 5);
});
