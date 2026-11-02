"use client";
import { useActionState } from "react";
import { createOrganisation } from "./actions";

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

export function OrgForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(createOrganisation, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="fullName" className="label">Your name</label>
        <input id="fullName" name="fullName" className="field" defaultValue={defaultName} required autoComplete="name" />
      </div>
      <div>
        <label htmlFor="name" className="label">Organisation name</label>
        <input id="name" name="name" className="field" required placeholder="e.g. Acme Support Services" />
      </div>
      <div>
        <label htmlFor="state" className="label">State (sets public holidays)</label>
        <select id="state" name="state" className="field" defaultValue="NSW">
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create organisation"}</button>
    </form>
  );
}
