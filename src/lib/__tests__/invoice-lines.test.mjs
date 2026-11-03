import assert from "node:assert/strict";
import { test } from "node:test";
import { linesForShift, totals } from "../invoice-lines.ts";
import { localToUtc } from "../time.ts";

const TZ = "Australia/Sydney";
const SELF_CARE = {
  id: "svc", name: "Assistance With Self Care Activities Standard", category_label: "01", unit: "Hours",
  weekday_code: "01_011_0107_1_1", weekday_rate: 73.58, evening_code: "01_015_0107_1_1", evening_rate: 81.07,
  night_code: "01_002_0107_1_1", night_rate: 82.5, saturday_code: "01_013_0107_1_1", saturday_rate: 103.54,
  sunday_code: "01_014_0107_1_1", sunday_rate: 133.5, public_holiday_code: null, public_holiday_rate: null,
  travel_code: "01_799_0107_1_1",
};
const FORMAT = "{participant} @ {date} {start} - {end} [{service}] [{code}]";
const opts = { tz: TZ, holidays: new Set(), participantName: "Ridge Kainz", lineFormat: FORMAT, kmRate: 1.02 };
const shift = (date, start, end, more = {}) => ({
  id: "s", starts_at: localToUtc(date, start, TZ), ends_at: localToUtc(date, end, TZ), break_minutes: 0,
  extra_minutes: 0, km: 0, support_item_code: null, charge_rate: null, service: SELF_CARE, ...more,
});

test("matches the sample invoice line (weekday 6–8pm)", () => {
  const { lines, problems } = linesForShift(shift("2026-10-19", "18:00", "20:00"), opts);
  assert.deepEqual(problems, []);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].description, "Ridge Kainz @ 19/10/2026 06:00 PM - 08:00 PM [01 Assistance With Self Care Activities Standard] [01_011_0107_1_1]");
  assert.equal(lines[0].quantity, 2); assert.equal(lines[0].unit_price, 73.58); assert.equal(lines[0].amount, 147.16);
});
test("weekday 3–9pm is an evening shift (01_015)", () => {
  const { lines } = linesForShift(shift("2026-10-23", "15:00", "21:00"), opts);
  assert.equal(lines[0].support_item_code, "01_015_0107_1_1"); assert.equal(lines[0].amount, 486.42);
});
test("Saturday and Sunday use their items", () => {
  assert.equal(linesForShift(shift("2026-10-24", "06:00", "08:00"), opts).lines[0].amount, 207.08);
  assert.equal(linesForShift(shift("2026-10-25", "06:00", "08:00"), opts).lines[0].amount, 267.0);
});
test("travel becomes a provider-travel line", () => {
  const { lines } = linesForShift(shift("2026-10-21", "09:00", "14:00", { km: 33 }), opts);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].kind, "travel"); assert.equal(lines[1].support_item_code, "01_799_0107_1_1");
  assert.equal(lines[1].amount, 33.66); assert.match(lines[1].description, /33km \$1\.02\/km$/);
});
test("missing public holiday price is reported, not guessed", () => {
  const { lines, problems } = linesForShift(shift("2026-12-25", "09:00", "11:00"), { ...opts, holidays: new Set(["2026-12-25"]) });
  assert.equal(lines.length, 0); assert.equal(problems.length, 1); assert.match(problems[0], /public holiday/);
});
test("per-shift override wins and includes approved extra time and breaks", () => {
  const { lines } = linesForShift(shift("2026-10-21", "09:00", "13:00", { support_item_code: "X1", charge_rate: 50, extra_minutes: 30, break_minutes: 30 }), opts);
  assert.equal(lines.length, 1); assert.equal(lines[0].quantity, 4); assert.equal(lines[0].amount, 200);
  assert.match(lines[0].description, /01:30 PM/); // end time includes the extra 30 minutes
});
test("shift crossing into Saturday splits into two lines", () => {
  const s = shift("2026-10-23", "22:00", "06:00"); s.ends_at = localToUtc("2026-10-24", "06:00", TZ);
  const { lines } = linesForShift(s, opts);
  assert.deepEqual(lines.map((l) => [l.support_item_code, l.quantity]), [["01_002_0107_1_1", 2], ["01_013_0107_1_1", 6]]);
});
test("no service is reported", () => {
  const { lines, problems } = linesForShift(shift("2026-10-21", "09:00", "10:00", { service: null }), opts);
  assert.equal(lines.length, 0); assert.equal(problems.length, 1);
});
test("totals match the sample invoice", () => {
  const amounts = [147.16, 147.16, 147.16, 147.16, 147.16, 147.16, 147.16, 147.16, 147.16, 207.08, 207.08, 267, 267];
  assert.deepEqual(totals(amounts.map((amount) => ({ amount, tax: 0 }))), { subtotal: 2272.6, tax: 0, total: 2272.6 });
});
