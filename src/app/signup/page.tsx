import { AuthShell } from "@/components/auth-shell";
import { OtpSignIn } from "@/components/otp-sign-in";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHostTenant } from "@/lib/tenant";
import { OrgForm } from "./org-form";

export const metadata = { title: "Create your organisation" };

export default async function SignupPage() {
  // New organisations are created on the platform domain, not a customer's.
  if (await getHostTenant()) redirect("/login");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthShell title="Create your organisation" subtitle="Start with your email — we'll send a code.">
        <OtpSignIn next="/signup" allowNewUsers cta="Continue" />
      </AuthShell>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  return (
    <AuthShell title="Set up your organisation" subtitle="You'll be the owner. You can add your logo and colours next.">
      <OrgForm defaultName={profile?.full_name ?? ""} />
    </AuthShell>
  );
}
