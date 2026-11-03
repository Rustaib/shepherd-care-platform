"use client";
import { useActionState } from "react";
import type { InvoiceSettings } from "@/lib/invoicing";
import { saveTemplate } from "./actions";

const TOKENS_LINE = "{participant} {date} {start} {end} {service} {code} {hours}";
const TOKENS_EMAIL = "{title} {invoice_number} {participant} {period} {total} {issue_date} {due_date} {business_name}";

function F({ label, name, value, hint, ...p }: { label: string; name: string; value: string | number | null; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value">) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} className="field" defaultValue={value ?? ""} {...p} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
function T({ label, name, value, rows = 3, hint }: { label: string; name: string; value: string | null; rows?: number; hint?: string }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <textarea id={name} name={name} rows={rows} className="field" defaultValue={value ?? ""} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TemplateForm({ s, orgName }: { s: InvoiceSettings; orgName: string }) {
  const [state, action, pending] = useActionState(saveTemplate, undefined);
  return (
    <form action={action} className="space-y-5">
      <section className="card space-y-4">
        <h2 className="font-semibold">Your details on the invoice</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Business name" name="business_name" value={s.business_name} placeholder={orgName} />
          <F label="Invoice title" name="title" value={s.title} hint="e.g. Tax Invoice, Invoice" />
          <F label="Phone" name="phone" value={s.phone} />
          <F label="Invoice email" name="email" value={s.email} type="email" hint="Printed on invoices; replies to invoice emails come here" />
        </div>
        <T label="Address" name="address" value={s.address} rows={3} hint="One line per row. Your ABN (from Settings) is added automatically." />
        <T label="Payment details" name="payment_details" value={s.payment_details} rows={3} hint="e.g. account name, BSB, account number, payment reference" />
        <T label="Footer note" name="footer" value={s.footer} rows={2} hint="Optional, e.g. 'NDIS supports are GST-free.'" />
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Numbering, terms and lines</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <F label="Number prefix" name="number_prefix" value={s.number_prefix} placeholder="e.g. INV-" />
          <F label="Next number" name="next_number" value={s.next_number} type="number" min={1} hint="Continue from your old system" />
          <F label="Payment terms (days)" name="payment_terms_days" value={s.payment_terms_days} type="number" min={0} max={120} />
          <F label="Travel rate ($/km)" name="km_rate" value={s.km_rate} inputMode="decimal" />
        </div>
        <F label="Line description" name="line_format" value={s.line_format} hint={`Placeholders: ${TOKENS_LINE}`} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="show_tax_column" defaultChecked={s.show_tax_column} /> Show a Tax column</label>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Invoice email</h2>
        <F label="Subject" name="email_subject" value={s.email_subject} />
        <T label="Message" name="email_body" value={s.email_body} rows={7} hint={`Placeholders: ${TOKENS_EMAIL}. You can change the recipients, subject and message each time you send.`} />
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Accounting and NDIA exports</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <F label="NDIA provider registration no." name="ndia_registration_number" value={s.ndia_registration_number} inputMode="numeric" hint="10 digits, for NDIA bulk payment requests" />
          <F label="Income account code" name="account_code" value={s.account_code} hint="Xero / QuickBooks / MYOB account" />
          <F label="Tax type" name="tax_type" value={s.tax_type} hint="Must match your accounting software, e.g. GST Free Income" />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save template"}</button>
        <a href="/api/invoices/preview" target="_blank" rel="noreferrer" className="btn-ghost">Preview PDF</a>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      </div>
    </form>
  );
}
