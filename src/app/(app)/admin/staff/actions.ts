"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { escapeHtml, sendEmail, sendEmailBatch } from "@/lib/email";
import { requireAdmin, type Organisation } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { portalUrl } from "@/lib/tenant";

export type InviteState = { error?: string; ok?: string; link?: string } | undefined;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["staff", "coordinator", "admin"]),
});

const ROLE_WORD: Record<string, string> = { staff: "a support worker", coordinator: "a coordinator", admin: "an admin" };

function inviteEmail(org: Organisation, inv: { email: string; role: string; full_name?: string | null; token: string }) {
  const link = `${portalUrl(org)}/invite/${inv.token}`;
  const first = inv.full_name?.trim().split(/\s+/)[0];
  return {
    link,
    message: {
      to: inv.email,
      subject: `You're invited to join ${org.name}`,
      html: `<p>Hi${first ? ` ${escapeHtml(first)}` : ""},</p><p>You've been invited to join <strong>${escapeHtml(org.name)}</strong> as ${ROLE_WORD[inv.role] ?? inv.role}. Sign in with this email address to see your shifts, write notes and submit claims.</p>
     <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:${org.brand_primary};color:#fff;border-radius:10px;text-decoration:none">Accept invitation</a></p>
     <p>This link expires in 7 days.</p>`,
    },
  };
}

export async function inviteMember(_: InviteState, formData: FormData): Promise<InviteState> {
  const { organisation: org } = await requireAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // An imported, not-yet-sent invitation for this email is sent instead of creating a second one
  const { data: existing } = await supabase.from("invitations").select("id,sent_at").eq("organisation_id", org.id)
    .eq("email", parsed.data.email).is("accepted_at", null).maybeSingle();
  const { data, error } = existing && !existing.sent_at
    ? await supabase.from("invitations").update({ role: parsed.data.role, sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() })
        .eq("id", existing.id).select("token,full_name").single()
    : await supabase.from("invitations").insert({ organisation_id: org.id, email: parsed.data.email, role: parsed.data.role, invited_by: user!.id })
        .select("token,full_name").single();
  if (error) {
    return { error: error.code === "23505" ? "That person already has an open invitation." : error.message };
  }

  const { link, message } = inviteEmail(org, { ...parsed.data, ...data });
  const sent = await sendEmail(message.to, message.subject, message.html);
  revalidatePath("/admin/staff");
  return sent
    ? { ok: `Invitation emailed to ${parsed.data.email}.` }
    : { ok: "Invitation created. Email isn't configured yet, so copy this link and send it yourself:", link };
}

/** Email invitations: imported ones not sent yet, or resend (with a fresh 7-day expiry). */
export async function sendInvitations(ids: string[] | "all-unsent"): Promise<{ ok?: string; error?: string }> {
  const { organisation: org } = await requireAdmin();
  const supabase = await createClient();
  let q = supabase.from("invitations").select("id,email,role,full_name,token").eq("organisation_id", org.id).is("accepted_at", null);
  q = ids === "all-unsent" ? q.is("sent_at", null) : q.in("id", ids);
  const { data: invites, error } = await q;
  if (error) return { error: error.message };
  if (!invites?.length) return { error: "Nothing to send." };

  const result = await sendEmailBatch(invites.map((i) => inviteEmail(org, i).message));
  const sentIds = invites.slice(0, result.sent).map((i) => i.id);
  if (sentIds.length) {
    await supabase.from("invitations").update({ sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() })
      .in("id", sentIds).eq("organisation_id", org.id);
  }
  revalidatePath("/admin/staff");
  if (result.error) return { error: `${result.sent ? `${result.sent} sent, then e` : "E"}mail failed: ${result.error}` };
  return { ok: `Invitation${sentIds.length === 1 ? "" : "s"} emailed to ${sentIds.length === 1 ? invites[0].email : `${sentIds.length} people`}.` };
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

