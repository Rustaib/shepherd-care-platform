/** Read participant and staff lists from CSV — our own template, or exports from other
 *  care-management systems (column names are matched loosely). Pure functions, no I/O. */
import { parseCsv } from "./price-guide.ts";

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;
type AuState = (typeof STATES)[number];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header lookup: the first alias present wins. */
function columns(header: string[], aliases: Record<string, string[]>) {
  const h = header.map(norm);
  const ix: Record<string, number> = {};
  for (const [key, names] of Object.entries(aliases)) ix[key] = names.map(norm).map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  return (row: string[], key: string) => (ix[key] >= 0 ? (row[ix[key]] ?? "").trim() : "");
}

/** dd/MM/yyyy (Australian), d-M-yyyy or yyyy-MM-dd → yyyy-MM-dd; null when unreadable. */
export function auDateToIso(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900) return null;
  return dt.toISOString().slice(0, 10);
}

const PARTICLES = new Set(["al", "el", "de", "da", "di", "du", "van", "von", "der", "den", "la", "le", "bin", "binti", "abu", "ibn", "st"]);
/** "Dylan Jamie Smith" → Dylan Jamie / Smith; "Bassam AL Zuhairi" → Bassam / AL Zuhairi. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  let i = parts.length - 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return { first: parts.slice(0, i).join(" "), last: parts.slice(i).join(" ") };
}

/** "unit 7/18 Smith Street, Campbelltown NSW 2560, Australia" → line1 / suburb / state / postcode. */
export function splitAddress(addr: string) {
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length && /^australia$/i.test(parts[parts.length - 1])) parts.pop();
  const out = { address_line1: null as string | null, address_line2: null as string | null, suburb: null as string | null, state: null as AuState | null, postcode: null as string | null };
  if (!parts.length) return out;
  const last = parts[parts.length - 1];
  const m = last.match(new RegExp(`^(.*?)\\s*\\b(${STATES.join("|")})\\b\\.?\\s*(\\d{4})?$`, "i"));
  if (m && parts.length > 1) {
    parts.pop();
    out.suburb = m[1].trim() || null;
    out.state = m[2].toUpperCase() as AuState;
    out.postcode = m[3] ?? null;
  } else if (parts.length > 1) {
    const pc = last.match(/^(.*?)\s*(\d{4})$/);
    parts.pop();
    out.suburb = (pc ? pc[1] : last).trim() || null;
    out.postcode = pc?.[2] ?? null;
  }
  out.address_line1 = parts[0] ?? null;
  out.address_line2 = parts.slice(1).join(", ") || null;
  return out;
}

const email = (v: string) => {
  const e = v.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
};
const phone = (v: string) => {
  const p = v.trim();
  return p.replace(/\D/g, "").length >= 8 ? p : null;   // ignore placeholders like "2"
};

// -------------------------------------------------------------------------------------------
// Participants

export type ParticipantImport = {
  external_ref: string | null; first_name: string; last_name: string; preferred_name: string | null;
  ndis_number: string | null; date_of_birth: string | null; phone: string | null; email: string | null;
  address_line1: string | null; address_line2: string | null; suburb: string | null; state: AuState | null; postcode: string | null;
  emergency_contact_name: string | null; emergency_contact_relationship: string | null; emergency_contact_phone: string | null;
  support_coordinator_name: string | null; support_coordinator_email: string | null; invoice_emails: string | null;
  support_notes: string | null; management_type: "ndia_managed" | "plan_managed" | "self_managed" | null;
  status: "active" | "inactive" | "archived";
  plan: { start_date: string; end_date: string } | null;
};

export const PARTICIPANT_TEMPLATE = ["first_name", "last_name", "preferred_name", "ndis_number", "date_of_birth", "phone", "email",
  "address_line1", "address_line2", "suburb", "state", "postcode", "management_type", "plan_start_date", "plan_end_date",
  "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone",
  "support_coordinator_name", "support_coordinator_email", "invoice_emails", "support_notes", "status", "external_id"];

const P_ALIASES: Record<string, string[]> = {
  first: ["first_name", "firstname", "given_name"], last: ["last_name", "lastname", "surname", "family_name"],
  full: ["name", "full_name", "client_name", "participant_name"], preferred: ["preferred_name", "nickname"],
  ndis: ["ndis_number", "ndia", "ndis", "ndis_no", "ndis_id"], dob: ["date_of_birth", "dob", "birth_date", "birthday"],
  mobile: ["mobile", "mobile_phone"], phone: ["phone", "home_phone", "telephone"], email: ["email", "email_address"],
  addr1: ["address_line1", "address_line_1", "street"], addr2: ["address_line2", "address_line_2"], address: ["address", "full_address"],
  suburb: ["suburb", "city", "town"], state: ["state"], postcode: ["postcode", "post_code", "zip"],
  mgmt: ["management_type", "client_types", "plan_management", "funding_management", "plan_type"],
  planStart: ["plan_start_date", "ndis_plan_start_date"], planEnd: ["plan_end_date", "ndis_plan_end_date", "plan_expiry_date"],
  ecName: ["emergency_contact_name", "carer", "next_of_kin"], ecRel: ["emergency_contact_relationship", "relation", "relationship"],
  ecPhone: ["emergency_contact_phone", "carer_phone", "next_of_kin_phone"],
  scName: ["support_coordinator_name", "support_coordinator"], scEmail: ["support_coordinator_email"],
  invoiceEmails: ["invoice_emails", "billing_emails"], notes: ["support_notes", "notes"],
  status: ["status"], ext: ["external_id", "client_id", "id", "participant_id"],
};

function management(v: string): ParticipantImport["management_type"] {
  const n = norm(v);
  if (!n) return null;
  if (n.includes("plan")) return "plan_managed";
  if (n.includes("self")) return "self_managed";
  if (n.includes("ndia") || n.includes("ndis") || n.includes("agency")) return "ndia_managed";
  return null;
}

export type ImportParse<T> = { rows: T[]; errors: string[]; warnings: string[] };

export function parseParticipants(text: string): ImportParse<ParticipantImport> {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], errors: ["The file is empty."], warnings: [] };
  const get = columns(all[0], P_ALIASES);
  const header = all[0].map(norm);
  const has = (k: string) => P_ALIASES[k].some((a) => header.includes(norm(a)));
  if (!has("full") && !(has("first") && has("last"))) {
    return { rows: [], errors: ["Couldn't find the participant names — the file needs first_name and last_name (or name) columns. Download the template to see the layout."], warnings: [] };
  }
  const rows: ParticipantImport[] = []; const errors: string[] = []; const warnings: string[] = [];
  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    let first = get(r, "first"), last = get(r, "last");
    if (!first && !last) ({ first, last } = splitFullName(get(r, "full")));
    if (!first) { errors.push(`Row ${line}: no name — skipped.`); return; }
    const who = `${first} ${last}`.trim();
    if (!last) warnings.push(`Row ${line} (${who}): no last name.`);

    let ndis: string | null = get(r, "ndis").replace(/\s/g, "") || null;
    if (ndis && !/^\d{9}$/.test(ndis)) { warnings.push(`Row ${line} (${who}): NDIS number "${ndis}" isn't 9 digits — left blank.`); ndis = null; }
    const dobRaw = get(r, "dob"), dob = dobRaw ? auDateToIso(dobRaw) : null;
    if (dobRaw && !dob) warnings.push(`Row ${line} (${who}): date of birth "${dobRaw}" not understood — left blank.`);
    const addr = get(r, "addr1") || get(r, "suburb")
      ? { address_line1: get(r, "addr1") || null, address_line2: get(r, "addr2") || null, suburb: get(r, "suburb") || null,
          state: (STATES as readonly string[]).includes(get(r, "state").toUpperCase()) ? get(r, "state").toUpperCase() as AuState : null,
          postcode: /^\d{4}$/.test(get(r, "postcode")) ? get(r, "postcode") : null }
      : splitAddress(get(r, "address"));
    const rawEmail = get(r, "email"), em = email(rawEmail);
    if (rawEmail && !em) warnings.push(`Row ${line} (${who}): email "${rawEmail}" isn't valid — left blank.`);
    let ecName = get(r, "ecName") || null;
    if (ecName && norm(ecName) === norm(who)) ecName = null;    // some systems put the participant as their own carer
    const ps = auDateToIso(get(r, "planStart")), pe = auDateToIso(get(r, "planEnd"));
    const st = norm(get(r, "status"));
    const scEmailRaw = get(r, "scEmail"), scEmail = email(scEmailRaw);
    if (scEmailRaw && !scEmail) warnings.push(`Row ${line} (${who}): support coordinator email isn't valid — left blank.`);
    rows.push({
      external_ref: get(r, "ext") || null, first_name: first, last_name: last || "-", preferred_name: get(r, "preferred") || null,
      ndis_number: ndis, date_of_birth: dob, phone: phone(get(r, "mobile")) ?? phone(get(r, "phone")), email: em, ...addr,
      emergency_contact_name: ecName, emergency_contact_relationship: ecName ? get(r, "ecRel") || null : null,
      emergency_contact_phone: phone(get(r, "ecPhone")),
      support_coordinator_name: get(r, "scName") || null, support_coordinator_email: scEmail,
      invoice_emails: get(r, "invoiceEmails").split(/[,;\s]+/).map(email).filter(Boolean).join(", ") || null,
      support_notes: get(r, "notes") || null, management_type: management(get(r, "mgmt")),
      status: st === "inactive" ? "inactive" : st === "archived" || st === "deceased" || st === "exited" ? "archived" : "active",
      plan: ps && pe && pe > ps ? { start_date: ps, end_date: pe } : null,
    });
  });
  return { rows, errors, warnings };
}

// -------------------------------------------------------------------------------------------
// Staff

export type StaffImport = {
  external_ref: string | null; email: string; full_name: string; phone: string | null;
  role: "staff" | "coordinator" | "admin"; employment_type: "full_time" | "part_time" | "casual" | "contractor" | null;
};

export const STAFF_TEMPLATE = ["full_name", "email", "mobile", "role", "employment_type", "external_id"];

const S_ALIASES: Record<string, string[]> = {
  full: ["full_name", "name", "staff_name"], first: ["first_name", "given_name"], last: ["last_name", "surname"],
  email: ["email", "email_address"], mobile: ["mobile", "mobile_phone"], phone: ["phone", "telephone"],
  role: ["role", "access_level", "user_type"], emp: ["employment_type", "employment", "area", "award", "employment_status"],
  ext: ["external_id", "user_id", "staff_id", "employee_id", "id"],
};

function role(v: string): StaffImport["role"] {
  const n = norm(v);
  if (n.includes("admin") || n === "owner") return "admin";
  if (n.includes("coordinator") || n.includes("manager") || n.includes("teamleader") || n.includes("supervisor")) return "coordinator";
  return "staff";
}
function employment(v: string): StaffImport["employment_type"] {
  const n = norm(v);
  if (n.includes("casual")) return "casual";
  if (n.includes("parttime")) return "part_time";
  if (n.includes("fulltime") || n.includes("permanent")) return "full_time";
  if (n.includes("contract")) return "contractor";
  return null;
}

export function parseStaff(text: string): ImportParse<StaffImport> {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], errors: ["The file is empty."], warnings: [] };
  const get = columns(all[0], S_ALIASES);
  if (!all[0].map(norm).some((h) => S_ALIASES.email.map(norm).includes(h))) {
    return { rows: [], errors: ["Couldn't find an email column — staff are invited by email. Download the template to see the layout."], warnings: [] };
  }
  const rows: StaffImport[] = []; const errors: string[] = []; const warnings: string[] = [];
  const seen = new Set<string>();
  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = get(r, "full") || [get(r, "first"), get(r, "last")].filter(Boolean).join(" ");
    const em = email(get(r, "email"));
    if (!em) { errors.push(`Row ${line}${name ? ` (${name})` : ""}: no valid email — skipped.`); return; }
    if (seen.has(em)) { warnings.push(`Row ${line} (${name || em}): ${em} appears more than once — only the first is used.`); return; }
    seen.add(em);
    rows.push({
      external_ref: get(r, "ext") || null, email: em, full_name: name, phone: phone(get(r, "mobile")) ?? phone(get(r, "phone")),
      role: role(get(r, "role")), employment_type: employment(get(r, "emp")),
    });
  });
  return { rows, errors, warnings };
}

export const templateCsv = (cols: string[], example: string[]) =>
  [cols.join(","), example.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")].join("\r\n") + "\r\n";
