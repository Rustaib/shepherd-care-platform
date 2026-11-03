import { getInvoiceSettings } from "@/lib/invoicing";
import { requireAdmin, requireUser } from "@/lib/org";
import { TemplateForm } from "./template-form";

export const metadata = { title: "Invoice template" };

export default async function InvoiceTemplate() {
  const { organisation: org } = await requireAdmin();
  const { supabase } = await requireUser();
  const s = await getInvoiceSettings(supabase, org.id);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Invoice template</h1>
      <p className="text-sm text-muted">Your logo and primary colour (from Settings) are used on every invoice. Save, then use Preview PDF to see the result.</p>
      <TemplateForm s={s} orgName={org.name} />
    </div>
  );
}
