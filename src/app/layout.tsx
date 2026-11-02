import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import { getAppBranding } from "@/lib/org";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getAppBranding();
  return {
    title: { default: b.appName, template: `%s · ${b.appName}` },
    description: "Participants, rostering, notes and timesheets for NDIS providers.",
    applicationName: b.appName,
    manifest: `/api/manifest/${b.id ?? "hoiva"}`,
    appleWebApp: { capable: true, title: b.appName, statusBarStyle: "default" },
    icons: { apple: b.iconUrl ?? "/icons/apple-touch-icon.png" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await getAppBranding();
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: b.brandPrimary };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
