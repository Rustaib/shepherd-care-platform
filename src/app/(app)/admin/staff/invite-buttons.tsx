"use client";
import { useState, useTransition } from "react";
import { sendInvitations } from "./actions";

export function SendInviteButton({ ids, label, primary }: { ids: string[] | "all-unsent"; label: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: string; error?: string }>();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={`${primary ? "btn-primary" : "btn-ghost"} px-3 py-1.5`} disabled={pending}
        onClick={() => start(async () => setResult(await sendInvitations(ids)))}>
        {pending ? "Sending…" : label}
      </button>
      {result?.error && <span role="alert" className="text-xs text-danger">{result.error}</span>}
      {result?.ok && <span className="text-xs text-success">{result.ok}</span>}
    </span>
  );
}
