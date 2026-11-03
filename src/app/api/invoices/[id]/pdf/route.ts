import { NextResponse, type NextRequest } from "next/server";
import { storeInvoicePdf } from "@/lib/invoicing";
import { isManager, requireMembership, requireUser } from "@/lib/org";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, organisation: org } = await requireMembership();
  if (!isManager(role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { supabase } = await requireUser();
  const { data: inv } = await supabase.from("invoices").select("invoice_number,pdf_path,bill_to").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Uint8Array | null = null;
  if (inv.pdf_path) {
    const { data } = await supabase.storage.from("invoices").download(inv.pdf_path);
    if (data) bytes = new Uint8Array(await data.arrayBuffer());
  }
  bytes ??= await storeInvoicePdf(supabase, org, id);

  const name = `${(inv.bill_to as { name?: string }).name ?? "Invoice"}_${inv.invoice_number}.pdf`.replace(/[^\w.-]+/g, "_");
  const inline = request.nextUrl.searchParams.get("view") === "1";
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
