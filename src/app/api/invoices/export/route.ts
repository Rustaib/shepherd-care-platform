import { NextResponse, type NextRequest } from "next/server";
import { FORMATS, toCsv, type ExportFormat } from "@/lib/accounting-export";
import { exportRows } from "@/lib/export-rows";
import { getInvoiceSettings } from "@/lib/invoicing";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { isValidDate } from "@/lib/time";

export async function GET(request: NextRequest) {
  const { role, organisation: org } = await requireMembership();
  if (!isManager(role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { supabase } = await requireUser();
  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") as ExportFormat;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!(format in FORMATS)) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  if (!isValidDate(from) || !isValidDate(to) || to < from) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });

  const settings = await getInvoiceSettings(supabase, org.id);
  const { rows } = await exportRows(supabase, org, settings, {
    from, to, participantIds: sp.getAll("p"),
    includeUninvoiced: format === "ndia" && sp.get("uninvoiced") === "1",
    ndiaManagedOnly: format === "ndia" && sp.get("ndiaOnly") === "1",
  });
  const body = toCsv(format, rows, { ndiaRegistrationNumber: settings.ndia_registration_number, abn: org.abn, accountCode: settings.account_code, taxType: settings.tax_type });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FORMATS[format].file}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
