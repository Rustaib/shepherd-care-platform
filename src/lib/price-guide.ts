/** Price book import/export in the common "price export" CSV layout:
 *  Price Book Name, Price Book External ID, Day Of Week, Time Of Day, Price, Reference Number,
 *  Price Per Km, Reference Number Km, Multiplier, Effective Date, Fixed Price, Provider Travel
 *  One row per service × time of day × effective date. Pure functions, no I/O. */

export const BANDS = ["weekday", "evening", "night", "saturday", "sunday", "public_holiday"] as const;
export type Band = (typeof BANDS)[number];

export type ServiceInput = {
  name: string; category_label: string | null; unit: "Hours" | "Each" | "Week" | "Month";
  travel_code: string | null; travel_rate: number | null; effective_from: string | null;
} & Record<`${Band}_code`, string | null> & Record<`${Band}_rate`, number | null>;

export const HEADER = ["Price Book Name", "Price Book External ID", "Day Of Week", "Time Of Day", "Price", "Reference Number",
  "Price Per Km", "Reference Number Km", "Multiplier", "Effective Date", "Fixed Price", "Provider Travel", "Charged Per"];

const CODE = /^[0-9]{2}_[0-9A-Z_]{3,30}$/i;

/** RFC 4180 CSV → rows of strings. Handles quotes, escaped quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** dd/MM/yyyy or yyyy-MM-dd → yyyy-MM-dd */
function isoDate(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** "01 Assistance …" → { category: "01", name: "Assistance …" } */
export function splitName(full: string) {
  const m = full.trim().match(/^(\d{2})\s+(.+)$/);
  return m ? { category: m[1], name: m[2].trim() } : { category: null, name: full.trim() };
}
/** Key used to match an imported row to an existing service, ignoring the category prefix, case and punctuation. */
export const serviceKey = (name: string) => norm(splitName(name).name);

/** Which bands a Day Of Week + Time Of Day pair covers. `allDay` rows lose to specific ones on the same date. */
function bandsFor(day: string, time: string): { bands: Band[]; allDay: boolean } | null {
  const d = norm(day), t = norm(time);
  if (d === "saturday") return { bands: ["saturday"], allDay: false };
  if (d === "sunday") return { bands: ["sunday"], allDay: false };
  if (d === "publicholiday") return { bands: ["public_holiday"], allDay: false };
  if (d !== "standard" && d !== "weekday") return null;
  if (t === "12am12am" || t === "") return { bands: ["weekday", "evening", "night"], allDay: true };
  if (t === "6am8pm" || t === "6am6pm") return { bands: ["weekday"], allDay: false };
  if (t === "8pm12am") return { bands: ["evening"], allDay: false };
  if (t === "12am6am") return { bands: ["night"], allDay: false };
  return null;
}

/** Is price `a` preferred over `b`? Prices already in effect beat future ones; among those in effect the
 *  latest wins, among future ones the soonest; on the same date a specific time of day beats "all day". */
function newer(a: { date: string; prio: number }, b: { date: string; prio: number } | undefined, today: string) {
  if (!b) return true;
  const ae = a.date <= today, be = b.date <= today;
  if (ae !== be) return ae;
  if (a.date !== b.date) return ae ? a.date > b.date : a.date < b.date;
  return a.prio > b.prio;
}

export type ParseResult = { services: ServiceInput[]; errors: string[] };

/** Read a price book. For every service and time of day the latest price effective on `today`
 *  wins (future prices are used only when nothing is effective yet). */
export function parsePriceBook(text: string, today: string): ParseResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { services: [], errors: ["The file is empty."] };
  const head = rows[0].map(norm);
  const col = (name: string) => head.indexOf(norm(name));
  const ix = {
    name: col("Price Book Name"), ext: col("Price Book External ID"), day: col("Day Of Week"), time: col("Time Of Day"),
    price: col("Price"), code: col("Reference Number"), km: col("Price Per Km"), kmCode: col("Reference Number Km"),
    mult: col("Multiplier"), date: col("Effective Date"), fixed: col("Fixed Price"), per: col("Charged Per"),
  };
  const missing = (["name", "day", "price", "code"] as const).filter((k) => ix[k] < 0);
  if (missing.length) {
    return { services: [], errors: [`This doesn't look like a price book: missing column(s) ${missing.map((k) => ({ name: "Price Book Name", day: "Day Of Week", price: "Price", code: "Reference Number" })[k]).join(", ")}. Download the template to see the layout.`] };
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  type Pick = { date: string; prio: number; price: number | null; code: string | null };
  type Acc = { display: string; bands: Partial<Record<Band, Pick>>; fixed: boolean; fixedDate: string; travel: { date: string; code: string | null; rate: number | null } | null; per: string | null; dayRows: boolean; dates: string[] };
  const byKey = new Map<string, Acc>();

  // Rows effective today or earlier; if a service only has future rows we fall back to them below.
  const parsed = rows.slice(1).map((r, i) => ({ r, line: i + 2 }));
  for (const { r, line } of parsed) {
    const full = get(r, ix.name);
    if (!full) continue;
    const date = isoDate(get(r, ix.date)) ?? "0000-01-01";
    const cover = bandsFor(get(r, ix.day), get(r, ix.time));
    if (!cover) { errors.push(`Row ${line}: "${get(r, ix.day)} ${get(r, ix.time)}" isn't a time of day we know — skipped.`); continue; }
    const priceRaw = get(r, ix.price).replace(/[$,]/g, "");
    const priceNum = priceRaw === "" ? null : Number(priceRaw);
    if (priceNum != null && !Number.isFinite(priceNum)) { errors.push(`Row ${line}: price "${get(r, ix.price)}" isn't a number — skipped.`); continue; }
    const mult = Number(get(r, ix.mult) || "1") || 1;
    const price = priceNum && priceNum > 0 ? Math.round(priceNum * mult * 100) / 100 : null;
    let code = get(r, ix.code).toUpperCase() || null;
    if (!code && CODE.test(get(r, ix.ext))) code = get(r, ix.ext).toUpperCase();
    if (code && !CODE.test(code)) { errors.push(`Row ${line}: "${code}" doesn't look like an NDIS item code — kept anyway.`); }

    const key = serviceKey(full);
    let acc = byKey.get(key);
    if (!acc) { acc = { display: full, bands: {}, fixed: false, fixedDate: "", travel: null, dayRows: false, dates: [], per: null }; byKey.set(key, acc); }
    acc.dates.push(date);
    if (!cover.allDay && cover.bands.some((b) => b === "saturday" || b === "sunday" || b === "public_holiday")) acc.dayRows = true;
    const prio = cover.allDay ? 1 : 2;
    for (const b of cover.bands) {
      const cand = { date, prio, price, code };
      if (newer(cand, acc.bands[b], today)) acc.bands[b] = cand;
    }
    if (newer({ date, prio: 0 }, acc.fixedDate ? { date: acc.fixedDate, prio: 0 } : undefined, today)) {
      acc.fixed = /^(true|yes|1)$/i.test(get(r, ix.fixed)); acc.fixedDate = date;
    }
    const per = norm(get(r, ix.per));
    if (["hour", "hours", "each", "shift", "week", "month"].includes(per)) acc.per = per;
    const kmCode = get(r, ix.kmCode).toUpperCase() || null;
    const km = Number(get(r, ix.km) || "0");
    if (kmCode && CODE.test(kmCode) && kmCode !== code && newer({ date, prio: 0 }, acc.travel ? { date: acc.travel.date, prio: 0 } : undefined, today)) {
      acc.travel = { date, code: kmCode, rate: km > 0 ? km : null };
    }
  }

  const services: ServiceInput[] = [];
  for (const acc of byKey.values()) {
    const { category, name } = splitName(acc.display);
    const s = { name: name.slice(0, 120), unit: acc.per ? ({ hour: "Hours", hours: "Hours", each: "Each", shift: "Each", week: "Week", month: "Month" } as const)[acc.per as "hour"] : !acc.fixed ? "Hours" : /\bweekly\b/i.test(name) ? "Week" : /\bmonthly\b/i.test(name) ? "Month" : "Each", travel_code: acc.travel?.code ?? null, travel_rate: acc.travel?.rate ?? null } as ServiceInput;
    for (const b of BANDS) { const p = acc.bands[b]; s[`${b}_code`] = p?.code ?? null; s[`${b}_rate`] = p?.price ?? null; }
    // A single all-day standard price with no weekend/holiday rows applies every day
    if (!acc.dayRows && acc.bands.weekday) for (const b of ["saturday", "sunday", "public_holiday"] as const) { s[`${b}_code`] = s.weekday_code; s[`${b}_rate`] = s.weekday_rate; }
    const codeCat = BANDS.map((b) => s[`${b}_code`]).find(Boolean)?.slice(0, 2) ?? null;
    s.category_label = category ?? (codeCat && /^\d{2}$/.test(codeCat) ? codeCat : null);
    const effective = acc.dates.filter((d) => d <= today && d !== "0000-01-01").sort().pop() ?? null;
    s.effective_from = effective;
    services.push(s);
  }
  return { services, errors };
}

type ExportService = Pick<ServiceInput, "name" | "category_label" | "unit" | "travel_code" | "travel_rate" | "effective_from"> & Record<string, unknown>;

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+@\t\r-]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Write services back out in the same layout, so the file can be edited and imported again. */
export function toPriceBookCsv(services: ExportService[], today: string, defaultKmRate: number): string {
  const out = [HEADER.join(",")];
  const where: Record<Band, [string, string]> = {
    weekday: ["Standard", "6 am - 8 pm"], evening: ["Standard", "8 pm - 12 am"], night: ["Standard", "12 am - 6 am"],
    saturday: ["Saturday", "12 am - 12 am"], sunday: ["Sunday", "12 am - 12 am"], public_holiday: ["Public Holiday", "12 am - 12 am"],
  };
  for (const s of services) {
    const full = s.category_label ? `${s.category_label} ${s.name}` : s.name;
    const date = dmy(s.effective_from ?? today);
    const km = s.travel_code ? (s.travel_rate ?? defaultKmRate) : 0;
    const vals = BANDS.map((b) => ({ b, code: (s[`${b}_code`] as string | null) ?? null, rate: (s[`${b}_rate`] as number | null) ?? null }));
    const filled = vals.filter((v) => v.code || v.rate != null);
    const same = filled.length === 6 && filled.every((v) => v.code === filled[0].code && Number(v.rate) === Number(filled[0].rate));
    const rows = same ? [{ day: "Standard", time: "12 am - 12 am", ...filled[0] }] : filled.map((v) => ({ day: where[v.b][0], time: where[v.b][1], ...v }));
    if (!rows.length) rows.push({ day: "Standard", time: "6 am - 8 pm", b: "weekday", code: null, rate: null });
    for (const r of rows) {
      out.push([full, "", r.day, r.time, r.rate ?? 0, r.code ?? "", km, s.travel_code ?? "", "1.0", date, s.unit === "Hours" ? "false" : "true", "false", s.unit].map(cell).join(","));
    }
  }
  return out.join("\r\n") + "\r\n";
}
