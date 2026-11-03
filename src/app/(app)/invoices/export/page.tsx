import Link from "next/link";
import { getInvoiceSettings } from "@/lib/invoicing";
import { displayName } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";
import { addDaysLocal, mondayOf, todayIn } from "@/lib/time";
import { ExportForm } from "./export-form";

export const metadata = { title: "Export for accounting" };

export default async function ExportPage() {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const from = addDaysLocal(mondayOf(todayIn(org.timezone)), -7);
  const [{ data: people }, settings] = await Promise.all([
    supabase.from("participants").select("id,first_name,last_name,preferred_name").eq("organisation_id", org.id).neq("status", "archived").order("last_name"),
    getInvoiceSettings(supabase, org.id),
  ]);
  return (
    <div className="space-y-5">
      <Link href="/invoices" className="text-sm text-muted hover:text-ink">← Invoices</Link>
      <h1 className="text-2xl font-bold tracking-tight">Export for accounting</h1>
      <p className="text-sm text-muted">Billed supports for the period as a CSV for the NDIA portal or your accounting software. For staff hours, use <Link href="/admin/exports" className="text-brand underline">Payroll export</Link>.</p>
      <ExportForm from={from} to={addDaysLocal(from, 6)} ndiaReady={!!settings.ndia_registration_number}
        people={(people ?? []).map((p) => ({ id: p.id, name: displayName(p) }))} />
    </div>
  );
}
