// Run with: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { localToUtc, mondayOf, shiftBounds, utcToLocal, localRangeUtc, addDaysLocal } from "../time.ts";

const TZ = "Australia/Sydney";

test("AEDT conversion (UTC+11)", () => {
  assert.equal(localToUtc("2026-11-02", "09:00", TZ), "2026-11-01T22:00:00.000Z");
});
test("AEST conversion (UTC+10)", () => {
  assert.equal(localToUtc("2026-06-15", "09:00", TZ), "2026-06-14T23:00:00.000Z");
});
test("round trip", () => {
  assert.deepEqual(utcToLocal("2026-11-01T22:00:00.000Z", TZ), { date: "2026-11-02", time: "09:00" });
});
test("overnight shift ends next day", () => {
  const b = shiftBounds("2026-11-06", "22:00", "07:00", TZ);
  assert.equal(b.overnight, true);
  assert.equal(b.starts_at, "2026-11-06T11:00:00.000Z");
  assert.equal(b.ends_at, "2026-11-06T20:00:00.000Z");
});
test("overnight across DST start (Oct 4 2026, clocks forward) is 8h not 9h", () => {
  const b = shiftBounds("2026-10-03", "22:00", "07:00", TZ);
  assert.equal((new Date(b.ends_at) - new Date(b.starts_at)) / 36e5, 8);
});
test("mondayOf", () => {
  assert.equal(mondayOf("2026-11-01"), "2026-10-26"); // Sunday → previous Monday
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
});
test("week range", () => {
  const r = localRangeUtc("2026-11-02", 7, TZ);
  assert.equal(r.start, "2026-11-01T13:00:00.000Z");
  assert.equal(r.end, "2026-11-08T13:00:00.000Z");
  assert.equal(addDaysLocal("2026-12-31", 1), "2027-01-01");
});
