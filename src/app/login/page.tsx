import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { OtpSignIn } from "@/components/otp-sign-in";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <AuthShell title="Sign in" subtitle="We'll email you a one-time code.">
      <OtpSignIn next={safeNext} />
      <p className="mt-5 text-center text-sm text-muted">
        New provider? <Link href="/signup" className="font-medium text-brand underline">Create an organisation</Link>
      </p>
    </AuthShell>
  );
}
