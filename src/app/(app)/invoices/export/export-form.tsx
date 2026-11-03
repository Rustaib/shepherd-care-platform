"use client";
import { useState } from "react";
import { FORMATS, type ExportFormat } from "@/lib/accounting-export";

export function ExportForm({ from, to, people, ndiaReady }: { from: string; to: string; people: { id: string; name: string }[]; ndiaReady: boolean }) {
  const [format, setFormat] = useState<ExportFormat>("ndia");
  const ndia = format === "ndia";
  return (
    <form action="/api/invoices/export" method="get" className="card space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3 md:col-span-1">
          <label htmlFor="format" className="label">Format</label>
          <select id="format" name="format" className="field" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
        </div>
        <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" defaultValue={from} className="field" /></div>
        <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" defaultValue={to} className="field" /></div>
      </div>

      {ndia ? (
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="ndiaOnly" value="1" defaultChecked /> Only NDIA-managed participants (others can&apos;t be bulk-claimed)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="uninvoiced" value="1" defaultChecked /> Include supports not yet invoiced (claim reference left blank)</label>
          {!ndiaReady && <p className="text-danger">Add your 10-digit NDIA provider registration number in Invoice template first — the NDIA rejects files without it.</p>}
          <p className="text-muted">Upload the file in the myplace provider portal: Payment Requests → Bulk Payment Request.</p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Accounting files contain invoices you&apos;ve generated in this period, one row per line, so the invoice numbers match your PDFs.
          {format === "myob" && " MYOB AccountRight only — MYOB Business Lite/Pro can't import invoices. Customer card names must match (Last Name, First Name)."}
          {format === "xero" && " In Xero: Business → Invoices → Import. Check the account code and tax type in Invoice template match your Xero settings."}
          {format === "qbo" && " In QuickBooks Online: Settings → Import data → Invoices, then map the columns."}
        </p>
      )}

      <fieldset>
        <legend className="label">Participants <span className="font-normal text-muted">(none ticked = everyone)</span></legend>
        <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="p" value={p.id} /> {p.name}</label>)}
        </div>
      </fieldset>
      <button className="btn-primary">⬇ Download CSV</button>
    </form>
  );
}
