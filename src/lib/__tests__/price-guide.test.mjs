import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePriceBook, toPriceBookCsv, parseCsv } from "../price-guide.ts";
import { NDIS_PRICE_GUIDE_CSV } from "../data/ndis-price-guide.ts";

const { services, errors } = parsePriceBook(NDIS_PRICE_GUIDE_CSV, "2026-11-03");
const by = (n) => services.find((s) => s.name === n);

test("default guide parses with current prices", () => {
  assert.deepEqual(errors, []);
  const sc = by("Assistance With Self Care Activities Standard");
  assert.equal(sc.category_label, "01");
  assert.deepEqual([sc.weekday_code, sc.weekday_rate, sc.evening_rate, sc.night_rate, sc.saturday_rate, sc.sunday_rate, sc.public_holiday_rate],
    ["01_011_0107_1_1", 73.58, 81.07, 82.57, 103.54, 133.5, 163.46]);
  assert.equal(sc.travel_code, "01_799_0107_1_1"); assert.equal(sc.travel_rate, 1.02);
  assert.equal(sc.effective_from, "2026-07-01");
});
test("older price applies on an earlier date", () => {
  const old = parsePriceBook(NDIS_PRICE_GUIDE_CSV, "2025-10-01").services.find((s) => s.name === "Assistance With Self Care Activities Standard");
  assert.equal(old.weekday_rate, 70.23);
});
test("single all-day price applies every day", () => {
  const hc = by("House Cleaning And Other Household Activities");
  assert.equal(hc.weekday_rate, 60.1); assert.equal(hc.night_rate, 60.1); assert.equal(hc.sunday_rate, 60.1); assert.equal(hc.public_holiday_code, "01_020_0120_1_1");
});
test("fixed price items, zero prices, and code from external ID", () => {
  const sil = by("Sil Support Weekly");
  assert.equal(sil.unit, "Each"); assert.equal(sil.weekday_rate, null); assert.equal(sil.category_label, "01");
  const sta = by("Sta And Assistance (Inc. Respite)");
  assert.equal(sta.weekday_rate, 2178.57); assert.equal(sta.public_holiday_rate, 4270.25);
  assert.equal(by("Adult Pull Ups").weekday_code, "03_093021077_0103_1_1");
});
test("specific time beats all-day on the same date", () => {
  const ot = by("Assessment Recommendation Therapy Or Training Occupational Therapist");
  assert.equal(ot.weekday_rate, 193.99); assert.equal(ot.evening_rate, 193.99);
});
test("export round-trips through import", () => {
  const csv = toPriceBookCsv(services, "2026-11-03", 0.99);
  const again = parsePriceBook(csv, "2026-11-03").services;
  assert.equal(again.length, services.length);
  for (const s of services) {
    const t = again.find((x) => x.name === s.name);
    for (const k of Object.keys(s)) assert.deepEqual(t[k], s[k], `${s.name} ${k}`);
  }
});
test("bad files are explained", () => {
  assert.match(parsePriceBook("a,b\n1,2", "2026-11-03").errors[0], /missing column/);
  assert.deepEqual(parseCsv('"a,""b""",c\r\n'), [['a,"b"', "c"]]);
});
