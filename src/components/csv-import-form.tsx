"use client";
import Link from "next/link";
import { useActionState, useState } from "react";

export type CsvImportState = { ok?: string; error?: string; notes?: string[]; next?: { href: string; label: string } } | undefined;

/** File picker + options + result summary for CSV imports. */
export function CsvImportForm({ action, templateHref, columnsHint, options, submitLabel = "Import" }: {
  action: (s: CsvImportState, f: FormData) => Promise<CsvImportState>;
  templateHref: string; columnsHint: string;
  options?: { name: string; label: string; defaultChecked?: boolean; hint?: string }[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <form action={formAction} className="card space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-6 text-center text-sm hover:border-brand">
          <input type="file" name="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
          <span className="font-medium">{name || "Choose a CSV file"}</span>
          <span className="text-xs text-muted">{columnsHint}</span>
        </label>
        {options?.map((o) => (
          <label key={o.name} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name={o.name} defaultChecked={o.defaultChecked} className="mt-0.5" />
            <span>{o.label}{o.hint && <span className="block text-xs text-muted">{o.hint}</span>}</span>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={pending || !name}>{pending ? "Importing…" : submitLabel}</button>
          <a href={templateHref} className="btn-ghost" download>Download template</a>
        </div>
      </form>
      {state && (
        <div role="status" className={`card space-y-2 text-sm ${state.error ? "border-danger" : ""}`}>
          <p className={`font-medium ${state.error ? "text-danger" : ""}`}>{state.error ?? state.ok}</p>
          {!!state.notes?.length && <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{state.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {state.next && <Link href={state.next.href} className="btn-primary inline-block">{state.next.label}</Link>}
        </div>
      )}
    </div>
  );
}
