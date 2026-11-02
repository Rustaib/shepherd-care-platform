import type { CSSProperties, ReactNode } from "react";

export function AuthShell({ title, subtitle, logo, style, children }: {
  title: string; subtitle?: ReactNode; logo?: string | null; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <main style={style} className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable @next/next/no-img-element */}
          {logo
            ? <img src={logo} alt="" className="mx-auto mb-4 h-14 w-auto object-contain" />
            : <img src="/hoiva-logo.svg" alt="Hoiva" className="mx-auto mb-4 h-16 w-16" />}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
