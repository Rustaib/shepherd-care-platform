import { NextResponse, type NextRequest } from "next/server";
import { isManager, requireMembership, requireUser } from "@/lib/org";
import { buildPayrollReport, payrollCsv } from "@/lib/payroll-report";
import { isValidDate } from "@/lib/time";

export async function GET(request: NextRequest) {
  const { role, organisation: org } = await requireMembership();
  if (!isManager(role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { supabase } = await requireUser();
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || to < from) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  const { rows } = await buildPayrollReport(supabase, org, from, to, sp.getAll("staff"));
  return new NextResponse(payrollCsv(rows, from, to), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
