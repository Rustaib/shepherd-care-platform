"use client";
import { useActionState, useState } from "react";
import { importServices, loadPriceGuide, type ImportState } from "./actions";

function Result({ state }: { state: ImportState }) {
  if (!state) return null;
  return (
    <div role="status" className={`rounded-lg border p-3 text-sm ${state.error ? "border-danger text-danger" : "border-line"}`}>
      <p className="font-medium">{state.error ?? state.ok}</p>
      {!!state.notes?.length && <ul className="mt-1 list-disc pl-5 text-xs text-muted">{state.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}

export function PriceImport({ hasServices }: { hasServices: boolean }) {
  const [guideState, guideAction, guidePending] = useActionState(loadPriceGuide.bind(null, false), undefined);
  const [fileState, fileAction, filePending] = useActionState(importServices, undefined);
  const [name, setName] = useState("");
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Import prices</h2>
        <p className="text-sm text-muted">Use the NDIS price guide built in, or import your own price list. A service in the file with the same name as one here replaces its codes and prices; new names are added. Prices with a future effective date are used once that date arrives — import again then.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={guideAction}>
          <button className="btn-ghost" disabled={guidePending}>{guidePending ? "Loading…" : hasServices ? "Update to current NDIS prices" : "Load NDIS price guide"}</button>
        </form>
        <a href="/api/services/template" className="btn-ghost" download>Download template{hasServices ? " (your prices)" : ""}</a>
        {hasServices && <a href="/api/services/template?source=ndis" className="btn-ghost" download>Download NDIS price guide</a>}
      </div>
      <Result state={guideState} />

      <form action={fileAction} className="space-y-3">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-5 text-center text-sm hover:border-brand">
          <input type="file" name="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
          <span className="font-medium">{name || "Choose a price list CSV"}</span>
          <span className="text-xs text-muted">Same columns as the template: Price Book Name, Day Of Week, Time Of Day, Price, Reference Number, Price Per Km, Reference Number Km, Effective Date, Fixed Price</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={filePending || !name}>{filePending ? "Importing…" : "Import"}</button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="only_new" /> Only add new services (don&apos;t change existing prices)</label>
        </div>
      </form>
      <Result state={fileState} />
    </section>
  );
}
