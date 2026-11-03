import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportRow } from "@/lib/accounting-export";
import { billableFor, type BillTo, type InvoiceSettings } from "@/lib/invoicing";
import type { Organisation } from "@/lib/org";

/** Lines for an export: invoiced lines in the period (any live invoice), plus —
 *  when asked — supports delivered but not yet invoiced (no invoice number). */
export async function exportRows(
  supabase: SupabaseClient, org: Organisation, settings: InvoiceSettings,
  opts: { from: string; to: string; participantIds: string[]; includeUninvoiced: boolean; ndiaManagedOnly: boolean },
): Promise<{ rows: ExportRow[]; excluded: number }> {
  let ids = opts.participantIds;
  if (!ids.length) {
    const { data } = await supabase.from("participants").select("id").eq("organisation_id", org.id).neq("status", "archived");
    ids = (data ?? []).map((p) => p.id);
  }
  if (!ids.length) return { rows: [], excluded: 0 };

  const { data: lines } = await supabase.from("invoice_lines")
    .select("kind,service_date,period_end,description,support_item_code,unit,quantity,unit_price,amount,invoice:invoices!inner(invoice_number,issue_date,due_date,status,bill_to,participant_id)")
    .eq("organisation_id", org.id).gte("service_date", opts.from).lte("service_date", opts.to)
    .neq("invoice.status", "void").in("invoice.participant_id", ids).order("service_date");

  type L = { kind: "service" | "travel" | "charge"; service_date: string; period_end: string | null; description: string; support_item_code: string | null; unit: string; quantity: number; unit_price: number; amount: number;
    invoice: { invoice_number: string; issue_date: string; due_date: string; bill_to: BillTo } };
  const rows: ExportRow[] = ((lines ?? []) as unknown as L[]).map((l) => ({
    customer: l.invoice.bill_to, invoiceNumber: l.invoice.invoice_number, issueDate: l.invoice.issue_date, dueDate: l.invoice.due_date,
    serviceDate: l.service_date, serviceDateTo: l.period_end, kind: l.kind, description: l.description, code: l.support_item_code, unit: l.unit,
    quantity: Number(l.quantity), unitPrice: Number(l.unit_price), amount: Number(l.amount),
    _mgmt: l.invoice.bill_to.management_type,
  } as ExportRow & { _mgmt: string | null }));

  if (opts.includeUninvoiced) {
    for (const b of await billableFor(supabase, org, ids, opts.from, opts.to, settings)) {
      for (const l of b.lines) {
        rows.push({
          customer: b.billTo, invoiceNumber: null, issueDate: null, dueDate: null, serviceDate: l.service_date, serviceDateTo: l.period_end ?? null, kind: l.kind,
          description: l.description, code: l.support_item_code, unit: l.unit, quantity: l.quantity, unitPrice: l.unit_price, amount: l.amount,
          _mgmt: b.billTo.management_type,
        } as ExportRow & { _mgmt: string | null });
      }
    }
  }

  if (!opts.ndiaManagedOnly) return { rows, excluded: 0 };
  const kept = rows.filter((r) => (r as ExportRow & { _mgmt: string | null })._mgmt === "ndia_managed");
  return { rows: kept, excluded: rows.length - kept.length };
}
