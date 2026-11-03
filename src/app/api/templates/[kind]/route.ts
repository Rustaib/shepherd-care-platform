import { NextResponse } from "next/server";
import { isManager, requireMembership } from "@/lib/org";
import { PARTICIPANT_TEMPLATE, STAFF_TEMPLATE, templateCsv } from "@/lib/people-import";

const TEMPLATES: Record<string, { cols: string[]; example: string[] }> = {
  participants: {
    cols: PARTICIPANT_TEMPLATE,
    example: ["Alex", "Sample", "", "430000000", "31/01/1990", "0400 000 000", "alex@example.com", "1 Example Street", "", "Penrith", "NSW", "2750",
      "Plan managed", "01/07/2026", "30/06/2027", "Jordan Sample", "Parent", "0400 000 001", "Casey Coordinator", "casey@example.com", "", "Prefers morning visits", "Active", ""],
  },
  staff: { cols: STAFF_TEMPLATE, example: ["Sam Worker", "sam@example.com", "0400 000 002", "Staff", "Casual", ""] },
};

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const { role } = await requireMembership();
  if (!isManager(role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const t = TEMPLATES[kind];
  if (!t) return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  return new NextResponse(templateCsv(t.cols, t.example), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-template.csv"` },
  });
}
