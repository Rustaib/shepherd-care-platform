import assert from "node:assert/strict";
import { test } from "node:test";
import { linesForCharge, linesForShift } from "../invoice-lines.ts";

const sil = { name: "Sil Support Weekly", category_label: "01", weekday_code: "01_821_0115_1_1" };
const weekly = { id: "c1", frequency: "week", amount: 5877.72, description: "SIL", support_item_code: null, start_date: "2026-07-01", end_date: null, service: sil };

test("weekly charge bills each Monday–Sunday week once", () => {
  const { lines } = linesForCharge(weekly, "2026-10-01", "2026-10-31", "Riley Example");
  assert.deepEqual(lines.map((l) => [l.period_start, l.quantity, l.amount]),
    [["2026-10-05", 1, 5877.72], ["2026-10-12", 1, 5877.72], ["2026-10-19", 1, 5877.72], ["2026-10-26", 1, 5877.72]]);
  assert.equal(lines[0].unit, "Week");
  assert.match(lines[0].description, /^Riley Example – SIL 05\/10\/2026 to 11\/10\/2026 \[01 Sil Support Weekly\] \[01_821_0115_1_1\]$/);
  // the week starting 28/09 belongs to September's invoice
  assert.equal(linesForCharge(weekly, "2026-09-01", "2026-09-30", "R").lines.at(-1).period_start, "2026-09-28");
});
test("consecutive weekly invoices cover every week exactly once", () => {
  const a = linesForCharge(weekly, "2026-10-19", "2026-10-25", "R").lines, b = linesForCharge(weekly, "2026-10-26", "2026-11-01", "R").lines;
  assert.deepEqual([...a, ...b].map((l) => l.period_start), ["2026-10-19", "2026-10-26"]);
});
test("part weeks at the start and end are charged per day", () => {
  const c = { ...weekly, start_date: "2026-10-22", end_date: "2026-11-03" };
  const { lines } = linesForCharge(c, "2026-10-01", "2026-11-30", "R");
  assert.deepEqual(lines.map((l) => [l.unit, l.quantity, l.unit_price, l.amount]),
    [["Day", 4, 839.67, 3358.68], ["Week", 1, 5877.72, 5877.72], ["Day", 2, 839.67, 1679.34]]);
});
test("monthly charge bills calendar months, prorating a mid-month start", () => {
  const m = { ...weekly, frequency: "month", amount: 25000, start_date: "2026-10-15", support_item_code: "01_821_0115_1_1" };
  const { lines } = linesForCharge(m, "2026-10-01", "2026-11-30", "R");
  assert.deepEqual(lines.map((l) => [l.period_start, l.unit, l.quantity, l.amount]), [["2026-10-01", "Day", 17, 13709.65], ["2026-11-01", "Month", 1, 25000]]);
});
test("no item code is reported", () => {
  assert.equal(linesForCharge({ ...weekly, service: null }, "2026-10-01", "2026-10-31", "R").problems.length, 1);
});
test("shifts on a weekly service aren't billed per shift", () => {
  const svc = { id: "s", unit: "Week", ...sil, weekday_rate: 5877.72 };
  const { lines, problems } = linesForShift({ id: "x", starts_at: "2026-10-20T00:00:00Z", ends_at: "2026-10-20T08:00:00Z", break_minutes: 0, extra_minutes: 0, km: 0, support_item_code: null, charge_rate: null, service: svc },
    { tz: "Australia/Sydney", holidays: new Set(), participantName: "R", lineFormat: "", kmRate: 1 });
  assert.deepEqual([lines, problems], [[], []]);
});
