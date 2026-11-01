"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/field";
import { AU_STATES } from "@/lib/ndis";
import type { FormState } from "./actions";

type P = Partial<Record<string, string | null>>;

export function ParticipantForm({ action, participant = {}, cancelHref }: {
  action: (s: FormState, f: FormData) => Promise<FormState>; participant?: P; cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (k: string) => participant[k] ?? "";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Personal details</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name *" name="first_name" defaultValue={v("first_name")} error={e.first_name} required autoComplete="off" />
          <Field label="Last name *" name="last_name" defaultValue={v("last_name")} error={e.last_name} required autoComplete="off" />
          <Field label="Preferred name" name="preferred_name" defaultValue={v("preferred_name")} />
          <Field label="NDIS number" name="ndis_number" defaultValue={v("ndis_number")} error={e.ndis_number} inputMode="numeric" maxLength={11} />
          <Field label="Date of birth" name="date_of_birth" type="date" defaultValue={v("date_of_birth")} error={e.date_of_birth} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Contact & address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" name="phone" type="tel" defaultValue={v("phone")} />
          <Field label="Email" name="email" type="email" defaultValue={v("email")} error={e.email} />
          <Field label="Address" name="address_line1" defaultValue={v("address_line1")} className="sm:col-span-2" />
          <Field label="Address line 2" name="address_line2" defaultValue={v("address_line2")} className="sm:col-span-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
          <Field label="Suburb" name="suburb" defaultValue={v("suburb")} />
          <Field label="State" name="state">
            <select id="state" name="state" className="field" defaultValue={v("state") || "NSW"}>
              <option value="">—</option>
              {AU_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Postcode" name="postcode" defaultValue={v("postcode")} error={e.postcode} inputMode="numeric" maxLength={4} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Emergency contact</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" name="emergency_contact_name" defaultValue={v("emergency_contact_name")} />
          <Field label="Relationship" name="emergency_contact_relationship" defaultValue={v("emergency_contact_relationship")} />
          <Field label="Phone" name="emergency_contact_phone" type="tel" defaultValue={v("emergency_contact_phone")} />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">Support notes</h2>
        <p className="text-sm text-muted">What support workers need to know: communication, routines, risks, likes and dislikes. Shown to staff rostered with this participant.</p>
        <textarea name="support_notes" rows={6} className="field" defaultValue={v("support_notes")} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save participant"}</button>
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
