"use client";
import { useActionState } from "react";
import { saveProfile } from "./actions";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="card space-y-4">
      <div><label htmlFor="full_name" className="label">Full name</label><input id="full_name" name="full_name" className="field" defaultValue={name} autoComplete="name" /></div>
      <div><label htmlFor="phone" className="label">Mobile</label><input id="phone" name="phone" type="tel" className="field" defaultValue={phone} autoComplete="tel" /></div>
      <div><span className="label">Email</span><p className="text-sm text-muted">{email} — sign-in codes are sent here. Ask an admin if it needs to change.</p></div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      </div>
    </form>
  );
}
