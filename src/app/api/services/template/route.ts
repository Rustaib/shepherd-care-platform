import { NextResponse, type NextRequest } from "next/server";
import { getInvoiceSettings } from "@/lib/invoicing";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { toPriceBookCsv } from "@/lib/price-guide";
import { defaultPriceGuide } from "@/lib/services-import";
import { todayIn } from "@/lib/time";

/** Price book CSV: your current services (?source=mine, default) or the NDIS price guide (?source=ndis).
 *  Edit it and import it back on Services & prices. */
export async function GET(request: NextRequest) {
  const { role, organisation: org } = await requireMembership();
  if (!isManager(role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { supabase } = await requireUser();
  const today = todayIn(org.timezone);
  const settings = await getInvoiceSettings(supabase, org.id);
  let services = request.nextUrl.searchParams.get("source") === "ndis" ? [] : (await supabase.from("services").select("*").eq("organisation_id", org.id).order("sort_order").order("name")).data ?? [];
  const isDefault = !services.length;
  if (isDefault) services = defaultPriceGuide(today);
  const body = toPriceBookCsv(services, today, settings.km_rate);
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${isDefault ? "ndis-price-guide" : "price-list"}-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
