"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org";

export async function acceptInvitation(token: string, fullName: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/invite/${token}`);

  if (fullName.trim()) {
    await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
  }
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };

  (await cookies()).set(ORG_COOKIE, orgId as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard?welcome=1");
}
