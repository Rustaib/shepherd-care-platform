import Link from "next/link";
import { CsvImportForm } from "@/components/csv-import-form";
import { requireAdmin } from "@/lib/org";
import { importStaff } from "./actions";

export const metadata = { title: "Import staff" };

export default async function ImportStaff() {
  await requireAdmin();
  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/staff" className="text-sm text-muted hover:text-ink">← Staff</Link>
      <h1 className="text-2xl font-bold tracking-tight">Import staff</h1>
      <p className="text-sm text-muted">
        Upload a CSV of your team — our template, or a user export from your current rostering system. Everyone is added to
        <strong> Not invited yet</strong> on the Staff page with their name, mobile, role and employment type, so you can check the list
        and send invitations when you&apos;re ready. People already on your team are skipped.
      </p>
      <CsvImportForm
        action={importStaff}
        templateHref="/api/templates/staff"
        columnsHint="Needs an email column. Also reads name (or first/last name), mobile or phone, role (admin / coordinator / staff) and employment type (casual, part time, full time)."
        options={[{ name: "send_now", label: "Email invitations straight away", hint: "Leave unticked to review the list first." }]}
      />
    </div>
  );
}
