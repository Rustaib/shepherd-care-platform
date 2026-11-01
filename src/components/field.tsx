import type { InputHTMLAttributes, ReactNode } from "react";

/** Labelled input with inline error. */
export function Field({ label, name, error, hint, className, children, ...props }: {
  label: string; name: string; error?: string; hint?: ReactNode; children?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">{label}</label>
      {children ?? (
        <input id={name} name={name} className={`field ${error ? "border-danger" : ""}`}
          aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined} {...props} />
      )}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${name}-err`} className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
