"use client";
import { useState, useTransition } from "react";
import { acceptInvitation } from "./actions";

export function AcceptForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await acceptInvitation(token, name);
        if (res?.error) setError(res.error);
      });
    }}>
      <div>
        <label htmlFor="name" className="label">Your full name</label>
        <input id="name" className="field" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Joining…" : "Accept invitation"}</button>
    </form>
  );
}
