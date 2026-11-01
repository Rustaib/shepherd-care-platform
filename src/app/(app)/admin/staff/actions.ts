"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export type InviteState = { error?: string; ok?: string; link?: string } | undefined;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["staff", "coordinator", "admin"]),
});

export async function inviteMember(_: InviteState, formData: FormData): Promise<InviteState> {
  const { organisation: org } = await requireAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("invitations")
    .insert({ organisation_id: org.id, email: parsed.data.email, role: parsed.data.role, invited_by: user!.id })
    .select("token")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "That person already has an open invitation." : error.message };
  }

  const link = `${env.appUrl()}/invite/${data.token}`;
  const sent = await sendEmail(
    parsed.data.email,
    `You're invited to join ${org.name}`,
    `<p>Hi,</p><p>You've been invited to join <strong>${escapeHtml(org.name)}</strong> as ${parsed.data.role}.</p>
     <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:${org.brand_primary};color:#fff;border-radius:10px;text-decoration:none">Accept invitation</a></p>
     <p>This link expires in 7 days.</p>`,
  );
  revalidatePath("/admin/staff");
  return sent
    ? { ok: `Invitation emailed to ${parsed.data.email}.` }
    : { ok: "Invitation created. Email isn't configured yet, so copy this link and send it yourself:", link };
}

export async function revokeInvitation(id: string) {
  const { organisation: org } = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id).eq("organisation_id", org.id);
  revalidatePath("/admin/staff");
}

export async function setMemberStatus(memberId: string, status: "active" | "suspended") {
  const { organisation: org } = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("org_members").update({ status }).eq("id", memberId).eq("organisation_id", org.id).neq("role", "owner");
  revalidatePath("/admin/staff");
}

export async function setMemberRole(memberId: string, role: "staff" | "coordinator" | "admin") {
  const { organisation: org } = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("org_members").update({ role }).eq("id", memberId).eq("organisation_id", org.id).neq("role", "owner");
  revalidatePath("/admin/staff");
}

