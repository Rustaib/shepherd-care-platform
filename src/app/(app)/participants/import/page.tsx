import Link from "next/link";
import { CsvImportForm } from "@/components/csv-import-form";
import { requireManager } from "@/lib/org";
import { importParticipants } from "./actions";

export const metadata = { title: "Import participants" };

export default async function ImportParticipants() {
  await requireManager();
  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/participants" className="text-sm text-muted hover:text-ink">← Participants</Link>
      <h1 className="text-2xl font-bold tracking-tight">Import participants</h1>
      <p className="text-sm text-muted">
        Upload a CSV — our template, or a client export from your current system. We read names, NDIS numbers, dates of birth
        (dd/mm/yyyy), contact details, addresses, how funding is managed and plan dates. Participants already here are matched by
        their ID from the other system, NDIS number, or name and date of birth, so importing the same file twice won&apos;t create duplicates.
      </p>
      <CsvImportForm
        action={importParticipants}
        templateHref="/api/templates/participants"
        columnsHint="Needs first_name and last_name (or a single name column). Everything else is optional."
        options={[{ name: "update_existing", label: "Update participants who are already here", defaultChecked: true, hint: "Fills in details from the file; blank cells never erase what you have." }]}
      />
      <p className="text-xs text-muted">Budgets aren&apos;t imported — add them to each plan afterwards.</p>
    </div>
  );
}
