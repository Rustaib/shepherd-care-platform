import { NextResponse } from "next/server";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoiceSettings } from "@/lib/invoicing";
import { describe } from "@/lib/invoice-lines";
import { assetUrl, isManager, requireMembership, requireUser } from "@/lib/org";

/** A sample invoice using the organisation's saved template. */
export async function GET() {
  const { role, organisation: org } = await requireMembership();
  if (!isManager(role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { supabase } = await requireUser();
  const s = await getInvoiceSettings(supabase, org.id);
  let logo: { bytes: Uint8Array; type: "png" | "jpg" } | null = null;
  for (const p of [org.logo_path, org.app_icon_path]) {
    const url = assetUrl(p);
    if (!url || logo) continue;
    const res = await fetch(url).catch(() => null);
    const bytes = res?.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    if (bytes?.[0] === 0x89) logo = { bytes, type: "png" };
    else if (bytes?.[0] === 0xff) logo = { bytes, type: "jpg" };
  }
  const line = (date: string, start: string, end: string, code: string, rate: number) => ({
    description: describe(s.line_format, { participant: "Sample Participant", date, start, end, service: "01 Assistance With Self Care Activities Standard", code, hours: "2.00" }),
    unit: "Hours", quantity: 2, unitPrice: rate, tax: 0, amount: Math.round(rate * 200) / 100,
  });
  const lines = [line("20/10/2026", "09:00 AM", "11:00 AM", "01_011_0107_1_1", 73.58), line("24/10/2026", "09:00 AM", "11:00 AM", "01_013_0107_1_1", 103.54)];
  const total = lines.reduce((t, l) => t + l.amount, 0);
  const bytes = await renderInvoicePdf({
    title: s.title, number: `${s.number_prefix}${s.next_number}`, issueDate: "27/10/2026", dueDate: "03/11/2026", periodLabel: "20/10/2026 – 26/10/2026",
    from: { name: s.business_name || org.name, lines: [...(s.address ?? "").split("\n").filter(Boolean), s.phone ? `Phone: ${s.phone}` : "", s.email ? `Email: ${s.email}` : "", org.abn ? `ABN: ${org.abn}` : ""].filter(Boolean) },
    to: { name: "Sample Participant", lines: ["1 Example Street", "Suburb NSW 2000"] }, meta: [["NDIS", "430000000"]],
    lines, subtotal: total, tax: 0, total, paymentDetails: s.payment_details, footer: s.footer, showTax: s.show_tax_column,
    accent: org.brand_primary, logo,
  });
  return new NextResponse(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="invoice-preview.pdf"', "Cache-Control": "no-store" } });
}
