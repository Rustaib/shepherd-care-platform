"use client";
import { useActionState, useTransition, useState } from "react";
import { connectDomain, refreshDomain, removeDomain, type DomainState } from "./domain-actions";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting for DNS", cls: "bg-accent/15 text-ink" },
  active: { label: "Live", cls: "bg-success/10 text-success" },
  error: { label: "Problem", cls: "bg-danger/10 text-danger" },
};

export function DomainForm({ domain, status, cnameTarget, configured }: {
  domain: string | null; status: string; cnameTarget: string | null; configured: boolean;
}) {
  const [state, connect, connecting] = useActionState(connectDomain, undefined);
  const [msg, setMsg] = useState<DomainState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DomainState>) => start(async () => setMsg(await fn()));
  const feedback = msg ?? state;
  const sub = domain?.split(".")[0];

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Custom domain</h2>
        <p className="mt-1 text-sm text-muted">Let your team use the portal on your own web address, e.g. <span className="font-mono">portal.yourbusiness.com.au</span>.</p>
      </div>

      {!configured ? (
        <p className="text-sm text-muted">Custom domains will be available once the platform&apos;s domain service is switched on.</p>
      ) : !domain ? (
        <form action={connect} className="flex flex-col gap-3 sm:flex-row">
          <input name="hostname" className="field" placeholder="portal.yourbusiness.com.au" required aria-label="Domain" />
          <button className="btn-primary shrink-0" disabled={connecting}>{connecting ? "Adding…" : "Connect domain"}</button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono font-medium">{domain}</span>
            <span className={`badge ${STATUS[status]?.cls ?? ""}`}>{STATUS[status]?.label ?? status}</span>
          </div>

          {status !== "active" && cnameTarget && (
            <div className="rounded-xl border border-line bg-surface p-4 text-sm">
              <p className="mb-3 font-medium">Add this DNS record where your domain is managed (e.g. Squarespace → Domains → DNS):</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted">Type</dt><dd className="font-mono">CNAME</dd>
                <dt className="text-muted">Host</dt><dd className="font-mono">{sub}</dd>
                <dt className="text-muted">Points to</dt><dd className="break-all font-mono">{cnameTarget}</dd>
              </dl>
              <p className="mt-3 text-muted">Then press <strong>Check status</strong>. SSL is issued automatically once DNS is detected — usually minutes, occasionally a few hours.</p>
            </div>
          )}

          <details className="rounded-xl border border-line p-4 text-sm">
            <summary className="cursor-pointer font-medium">Optional: also open the portal from yourbusiness.com.au/portal</summary>
            <p className="mt-2 text-muted">In Squarespace go to Settings → Developer Tools → URL Mappings and add:</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">/portal -&gt; https://{domain} 301</pre>
          </details>

          <div className="flex flex-wrap gap-2">
            {status !== "active" && <button type="button" className="btn-primary" disabled={pending} onClick={() => run(refreshDomain)}>{pending ? "Checking…" : "Check status"}</button>}
            <button type="button" className="btn-ghost text-danger" disabled={pending}
              onClick={() => { if (confirm(`Disconnect ${domain}? Staff will need to use the main platform address.`)) run(removeDomain); }}>
              Disconnect
            </button>
          </div>
        </div>
      )}
      {feedback?.error && <p role="alert" className="text-sm text-danger">{feedback.error}</p>}
      {feedback?.ok && <p className="text-sm text-success">{feedback.ok}</p>}
    </section>
  );
}
