"use client";
import { useActionState, useRef, useEffect } from "react";
import { inviteMember } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);
  return (
    <form ref={formRef} action={action} className="card space-y-4">
      <h2 className="text-lg font-semibold">Invite a team member</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" className="field" required placeholder="name@example.com" />
        </div>
        <div>
          <label htmlFor="role" className="label">Role</label>
          <select id="role" name="role" className="field" defaultValue="staff">
            <option value="staff">Support worker</option>
            <option value="coordinator">Coordinator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state?.ok && (
        <div className="space-y-2 text-sm">
          <p className="text-success">{state.ok}</p>
          {state.link && <input readOnly className="field font-mono text-xs" value={state.link} onFocus={(e) => e.currentTarget.select()} />}
        </div>
      )}
    </form>
  );
}
