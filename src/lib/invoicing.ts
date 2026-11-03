import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, parseISO } from "date-fns";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { linesForShift, totals, type Line, type Service } from "@/lib/invoice-lines";
import { assetUrl, type Organisation } from "@/lib/org";
import { localRangeUtc, todayIn } from "@/lib/time";

export type InvoiceSettings = {
  title: string; number_prefix: string; next_number: number; payment_terms_days: number;
  business_name: string | null; address: string | null; phone: string | null; email: string | null;
  payment_details: string | null; footer: string | null; line_format: string; show_tax_column: boolean;
  km_rate: number; ndia_registration_number: string | null; account_code: string; tax_type: string;
  email_subject: string; email_body: string;
};

export const DEFAULT_SETTINGS: InvoiceSettings = {
  title: "Tax Invoice", number_prefix: "", next_number: 1001, payment_terms_days: 7,
  business_name: null, address: null, phone: null, email: null, payment_details: null, footer: null,
  line_format: "{participant} @ {date} {start} - {end} [{service}] [{code}]", show_tax_column: true,
  km_rate: 0.99, ndia_registration_number: null, account_code: "200", tax_type: "GST Free Income",
  email_subject: "{title} {invoice_number} for {participant} ({period})",
  email_body: "Hi,\n\nPlease find attached {title_lower} {invoice_number} for {participant} for supports delivered {period}.\n\nTotal: {total}, due {due_date}.\n\nKind regards,\n{business_name}",
};

export async function getInvoiceSettings(supabase: SupabaseClient, orgId: string): Promise<InvoiceSettings> {
  const { data } = await supabase.from("invoice_settings").select("*").eq("organisation_id", orgId).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}), km_rate: Number(data?.km_rate ?? DEFAULT_SETTINGS.km_rate) };
}

export const auDate = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");
export const periodLabel = (from: string, to: string) => `${auDate(from)} – ${auDate(to)}`;
const money = (n: number) => "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type BillTo = {
  name: string; first_name?: string; last_name?: string; ndis_number: string | null;
  address_line1?: string | null; address_line2?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null; email: string | null; phone: string | null;
  address: string[]; support_coordinator_name: string | null; support_coordinator_email: string | null;
  plan_manager_name: string | null; plan_manager_email: string | null; management_type: string | null;
  invoice_emails: string | null;
};

type ParticipantRow = {
  id: string; first_name: string; last_name: string; ndis_number: string | null; email: string | null; phone: string | null;
  address_line1: string | null; address_line2: string | null; suburb: string | null; state: string | null; postcode: string | null;
  support_coordinator_name: string | null; support_coordinator_email: string | null; invoice_emails: string | null;
  ndis_plans: { start_date: string; end_date: string; status: string; management_type: string; plan_manager_name: string | null; plan_manager_email: string | null }[];
};

function billTo(p: ParticipantRow, asOf: string): BillTo {
  const plan = p.ndis_plans.filter((x) => x.status !== "draft" && x.start_date <= asOf).sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  return {
    name: `${p.first_name} ${p.last_name}`, first_name: p.first_name, last_name: p.last_name,
    ndis_number: p.ndis_number, email: p.email, phone: p.phone,
    address_line1: p.address_line1, address_line2: p.address_line2, suburb: p.suburb, state: p.state, postcode: p.postcode,
    address: [p.address_line1, p.address_line2, [p.suburb, p.state, p.postcode].filter(Boolean).join(" ")].filter((x): x is string => !!x),
    support_coordinator_name: p.support_coordinator_name, support_coordinator_email: p.support_coordinator_email,
    plan_manager_name: plan?.plan_manager_name ?? null, plan_manager_email: plan?.plan_manager_email ?? null,
    management_type: plan?.management_type ?? null, invoice_emails: p.invoice_emails,
  };
}

/** Default recipients: support coordinator, plan manager (plan-managed), extra invoice emails. */
export function defaultRecipients(b: BillTo) {
  const list = [b.support_coordinator_email, b.management_type === "plan_managed" ? b.plan_manager_email : null,
    ...(b.invoice_emails ?? "").split(/[,;\s]+/)];
  return [...new Set(list.map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

export type ParticipantBilling = {
  participant: { id: string; name: string };
  billTo: BillTo;
  lines: Line[];
  problems: string[];
  alreadyBilled: number;                 // shift lines skipped because they're on another invoice
  overlapping: { id: string; invoice_number: string; status: string; period_start: string; period_end: string }[];
};

/** Everything billable for these participants in [from, to] (local dates):
 *  worked shifts priced from the price list, approved extra time and km,
 *  minus anything already on a live invoice. */
export async function billableFor(
  supabase: SupabaseClient, org: Pick<Organisation, "id" | "timezone" | "state">, participantIds: string[], from: string, to: string,
  settings: InvoiceSettings, opts: { includeInvoiced?: boolean } = {},
): Promise<ParticipantBilling[]> {
  if (!participantIds.length) return [];
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const { start, end } = localRangeUtc(from, days, org.timezone);
  const now = new Date().toISOString();

  const [{ data: people }, { data: shifts }, { data: holidays }, { data: overlaps }] = await Promise.all([
    supabase.from("participants")
      .select("id,first_name,last_name,ndis_number,email,phone,address_line1,address_line2,suburb,state,postcode,support_coordinator_name,support_coordinator_email,invoice_emails,ndis_plans(start_date,end_date,status,management_type,plan_manager_name,plan_manager_email)")
      .eq("organisation_id", org.id).in("id", participantIds),
    supabase.from("shifts")
      .select("id,participant_id,starts_at,ends_at,break_minutes,support_item_code,charge_rate,service:services(*),timesheet_adjustments(extra_minutes,status),travel_logs(kilometres,status)")
      .eq("organisation_id", org.id).in("participant_id", participantIds)
      .in("status", ["published", "in_progress", "completed"]).not("staff_user_id", "is", null)
      .gte("starts_at", start).lt("starts_at", end).lte("ends_at", now).order("starts_at"),
    supabase.from("public_holidays").select("holiday_date").eq("state", org.state)
      .or(`organisation_id.is.null,organisation_id.eq.${org.id}`).gte("holiday_date", from).lte("holiday_date", to),
    supabase.from("invoices").select("id,participant_id,invoice_number,status,period_start,period_end")
      .eq("organisation_id", org.id).in("participant_id", participantIds).neq("status", "void")
      .lte("period_start", to).gte("period_end", from),
  ]);

  type S = {
    id: string; participant_id: string; starts_at: string; ends_at: string; break_minutes: number;
    support_item_code: string | null; charge_rate: number | null; service: Service | null;
    timesheet_adjustments: { extra_minutes: number; status: string }[]; travel_logs: { kilometres: number; status: string }[];
  };
  const shiftRows = (shifts ?? []) as unknown as S[];

  // Lines already on live invoices
  const billed = new Set<string>();
  if (!opts.includeInvoiced && shiftRows.length) {
    const { data } = await supabase.from("invoice_lines").select("shift_id,kind,invoice:invoices!inner(status)")
      .in("shift_id", shiftRows.map((s) => s.id)).neq("invoice.status", "void");
    for (const l of data ?? []) billed.add(`${l.shift_id}:${l.kind}`);
  }

  const holidaySet = new Set((holidays ?? []).map((h) => h.holiday_date as string));
  return ((people ?? []) as unknown as ParticipantRow[]).map((p) => {
    const b = billTo(p, to);
    const lines: Line[] = []; const problems: string[] = []; let alreadyBilled = 0;
    for (const s of shiftRows.filter((x) => x.participant_id === p.id)) {
      const res = linesForShift({
        ...s,
        charge_rate: s.charge_rate == null ? null : Number(s.charge_rate),
        extra_minutes: s.timesheet_adjustments.filter((a) => a.status === "approved").reduce((t, a) => t + a.extra_minutes, 0),
        km: s.travel_logs.filter((t) => t.status === "approved").reduce((t, x) => t + Number(x.kilometres), 0),
      }, { tz: org.timezone, holidays: holidaySet, participantName: b.name, lineFormat: settings.line_format, kmRate: settings.km_rate });
      for (const l of res.lines) {
        if (billed.has(`${l.shift_id}:${l.kind}`)) { if (l.kind === "service") alreadyBilled++; continue; }
        lines.push(l);
      }
      problems.push(...res.problems);
    }
    return {
      participant: { id: p.id, name: b.name }, billTo: b, lines, problems, alreadyBilled,
      overlapping: (overlaps ?? []).filter((o) => o.participant_id === p.id) as ParticipantBilling["overlapping"],
    };
  }).sort((a, b) => a.participant.name.localeCompare(b.participant.name));
}

/** Create one invoice per participant that has something to bill. */
export async function createInvoices(
  supabase: SupabaseClient, org: Organisation, userId: string, from: string, to: string, participantIds: string[], issueDate?: string,
) {
  const settings = await getInvoiceSettings(supabase, org.id);
  const billing = (await billableFor(supabase, org, participantIds, from, to, settings)).filter((b) => b.lines.length);
  if (!billing.length) return { created: [] as string[], skipped: participantIds.length };

  const { data: first, error: nErr } = await supabase.rpc("allocate_invoice_numbers", { p_org: org.id, p_count: billing.length });
  if (nErr) throw new Error(nErr.message);
  const issue = issueDate ?? todayIn(org.timezone);
  const due = format(addDays(parseISO(issue), settings.payment_terms_days), "yyyy-MM-dd");

  const created: string[] = [];
  for (const [i, b] of billing.entries()) {
    const t = totals(b.lines);
    const { data: inv, error } = await supabase.from("invoices").insert({
      organisation_id: org.id, participant_id: b.participant.id,
      invoice_number: `${settings.number_prefix}${Number(first) + i}`,
      period_start: from, period_end: to, issue_date: issue, due_date: due,
      subtotal: t.subtotal, tax: t.tax, total: t.total, bill_to: b.billTo, created_by: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { error: lErr } = await supabase.from("invoice_lines").insert(b.lines.map((l, n) => ({
      ...l, invoice_id: inv.id, organisation_id: org.id, sort_order: n,
    })));
    if (lErr) {
      await supabase.from("invoices").delete().eq("id", inv.id);
      throw new Error(lErr.code === "23505" ? `Some of ${b.participant.name}'s shifts were invoiced by someone else just now. Refresh and try again.` : lErr.message);
    }
    await storeInvoicePdf(supabase, org, inv.id, settings);
    created.push(inv.id);
  }
  return { created, skipped: participantIds.length - billing.length };
}

async function logoForPdf(org: Organisation): Promise<{ bytes: Uint8Array; type: "png" | "jpg" } | null> {
  for (const path of [org.logo_path, org.app_icon_path]) {
    const url = assetUrl(path);
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, type: "png" };
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, type: "jpg" };
    } catch { /* try the next one */ }
  }
  return null;
}

/** Render the invoice's PDF from its saved lines and store it. */
export async function storeInvoicePdf(supabase: SupabaseClient, org: Organisation, invoiceId: string, settings?: InvoiceSettings) {
  const s = settings ?? (await getInvoiceSettings(supabase, org.id));
  const [{ data: inv }, { data: lines }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).single(),
    supabase.from("invoice_lines").select("*").eq("invoice_id", invoiceId).order("sort_order"),
  ]);
  if (!inv) throw new Error("Invoice not found");
  const b = inv.bill_to as BillTo;
  const fromLines = [
    ...(s.address ?? "").split("\n").filter(Boolean),
    s.phone && `Phone: ${s.phone}`, s.email && `Email: ${s.email}`,
    org.abn && `ABN: ${org.abn}`,
  ].filter((x): x is string => !!x);
  const bytes = await renderInvoicePdf({
    title: s.title, number: inv.invoice_number, issueDate: auDate(inv.issue_date), dueDate: auDate(inv.due_date),
    periodLabel: periodLabel(inv.period_start, inv.period_end),
    from: { name: s.business_name || org.name, lines: fromLines },
    to: { name: b.name, lines: [...b.address, b.phone ? `Phone: ${b.phone}` : "", b.email ? `Email: ${b.email}` : ""].filter(Boolean) },
    meta: b.ndis_number ? [["NDIS", b.ndis_number]] : [],
    lines: (lines ?? []).map((l) => ({ description: l.description, unit: l.unit, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), tax: Number(l.tax), amount: Number(l.amount) })),
    subtotal: Number(inv.subtotal), tax: Number(inv.tax), total: Number(inv.total),
    paymentDetails: s.payment_details, footer: s.footer, showTax: s.show_tax_column, accent: org.brand_primary,
    logo: await logoForPdf(org),
  });
  const path = `${org.id}/${invoiceId}.pdf`;
  const { error } = await supabase.storage.from("invoices").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Couldn't save the PDF: ${error.message}`);
  await supabase.from("invoices").update({ pdf_path: path }).eq("id", invoiceId);
  return bytes;
}

/** Placeholders for email subject/body templates. */
export function fillTemplate(tpl: string, inv: { invoice_number: string; total: number; due_date: string; issue_date: string; period_start: string; period_end: string; bill_to: BillTo }, s: InvoiceSettings, orgName: string) {
  const values: Record<string, string> = {
    title: s.title, title_lower: s.title.toLowerCase(), invoice_number: inv.invoice_number, participant: inv.bill_to.name,
    period: periodLabel(inv.period_start, inv.period_end), total: money(inv.total), due_date: auDate(inv.due_date),
    issue_date: auDate(inv.issue_date), business_name: s.business_name || orgName,
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

export const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  generated: { label: "Invoice Generated", cls: "bg-accent/15 text-ink" },
  sent: { label: "Invoice Sent", cls: "bg-brand/10 text-brand" },
  paid: { label: "Invoice Paid", cls: "bg-success/10 text-success" },
  void: { label: "Void", cls: "bg-surface text-muted line-through" },
};
