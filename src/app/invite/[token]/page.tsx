import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { OtpSignIn } from "@/components/otp-sign-in";
import { brandStyle } from "@/lib/brand";
import { logoUrl } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("invitation_preview", { p_token: token });
  const invite = (rows as { organisation_name: string; email: string; role: string; logo_path: string | null; brand_primary: string }[] | null)?.[0];

  if (!invite) {
    return (
      <AuthShell title="Invitation unavailable" subtitle="This link is invalid, already used, or has expired.">
        <p className="text-sm text-muted">Ask your administrator to send a new invitation.</p>
        <Link href="/login" className="btn-ghost mt-4 w-full">Go to sign in</Link>
      </AuthShell>
    );
  }

  const style = brandStyle({ brand_primary: invite.brand_primary, brand_secondary: invite.brand_primary, brand_accent: invite.brand_primary });
  const logo = logoUrl({ logo_path: invite.logo_path });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthShell style={style} logo={logo} title={`Join ${invite.organisation_name}`}
        subtitle="First, confirm your email with a one-time code.">
        <OtpSignIn next={`/invite/${token}`} lockedEmail={invite.email} allowNewUsers cta="Send my code" />
      </AuthShell>
    );
  }

  if (user.email?.toLowerCase() !== invite.email) {
    return (
      <AuthShell style={style} logo={logo} title="Different account"
        subtitle={<>This invitation is for <strong>{invite.email}</strong>, but you&apos;re signed in as {user.email}.</>}>
        <form action="/auth/signout" method="post"><button className="btn-primary w-full">Sign out and switch</button></form>
      </AuthShell>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  return (
    <AuthShell style={style} logo={logo} title={`Join ${invite.organisation_name}`} subtitle={`You've been invited as ${invite.role}.`}>
      <AcceptForm token={token} defaultName={profile?.full_name ?? ""} />
    </AuthShell>
  );
}
