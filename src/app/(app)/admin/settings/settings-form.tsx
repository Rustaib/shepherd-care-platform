"use client";
import { useActionState, useState } from "react";
import { readableOn } from "@/lib/brand";
import { saveSettings } from "./actions";

type Org = {
  name: string; abn: string | null; ndis_registration_number: string | null; state: string;
  brand_primary: string; brand_secondary: string; brand_accent: string;
};

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

function ColourField({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={value} onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1" />
        <input id={name} name={name} className="field font-mono" value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9a-fA-F]{6}" />
      </div>
    </div>
  );
}

export function SettingsForm({ org, logo }: { org: Org; logo: string | null }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  const [primary, setPrimary] = useState(org.brand_primary);
  const [secondary, setSecondary] = useState(org.brand_secondary);
  const [accent, setAccent] = useState(org.brand_accent);
  const [preview, setPreview] = useState<string | null>(logo);

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Organisation details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">Name</label>
            <input id="name" name="name" className="field" defaultValue={org.name} required />
          </div>
          <div>
            <label htmlFor="abn" className="label">ABN</label>
            <input id="abn" name="abn" className="field" defaultValue={org.abn ?? ""} inputMode="numeric" />
          </div>
          <div>
            <label htmlFor="ndis" className="label">NDIS registration number</label>
            <input id="ndis" name="ndis_registration_number" className="field" defaultValue={org.ndis_registration_number ?? ""} />
          </div>
          <div>
            <label htmlFor="state" className="label">State (public holidays)</label>
            <select id="state" name="state" className="field" defaultValue={org.state}>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Branding</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-40 place-items-center rounded-xl border border-dashed border-line bg-surface p-2">
            {preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              : <span className="text-xs text-muted">No logo</span>}
          </div>
          <div className="space-y-2">
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
            <p className="text-xs text-muted">PNG, JPG or WebP, under 2 MB. A wide logo on a transparent background works best.</p>
            {logo && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_logo" /> Remove current logo</label>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ColourField name="brand_primary" label="Primary" value={primary} onChange={setPrimary} />
          <ColourField name="brand_secondary" label="Secondary" value={secondary} onChange={setSecondary} />
          <ColourField name="brand_accent" label="Accent" value={accent} onChange={setAccent} />
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: primary, color: readableOn(primary) }}>Primary button</span>
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: secondary, color: readableOn(secondary) }}>Completed</span>
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: accent, color: readableOn(accent) }}>Reminder</span>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.ok && <p className="text-sm text-success">{state.ok}</p>}
      </div>
    </form>
  );
}
