import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { OtpSignIn } from "@/components/otp-sign-in";
import { brandStyle } from "@/lib/brand";
import { logoUrl } from "@/lib/org";
import { getHostTenant } from "@/lib/tenant";

export async function generateMetadata() {
  const tenant = await getHostTenant();
  return { title: tenant ? `Sign in · ${tenant.name}` : "Sign in" };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const tenant = await getHostTenant();
  return (
    <AuthShell style={tenant ? brandStyle(tenant) : undefined} logo={tenant ? logoUrl(tenant) : null}
      title={tenant ? tenant.name : "Sign in"} subtitle="Sign in with a one-time code sent to your email.">
      <OtpSignIn next={safeNext} />
      {!tenant && (
        <p className="mt-5 text-center text-sm text-muted">
          New provider? <Link href="/signup" className="font-medium text-brand underline">Create an organisation</Link>
        </p>
      )}
    </AuthShell>
  );
}
