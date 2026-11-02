import "server-only";
import { escapeHtml, sendEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import { portalUrl } from "@/lib/tenant";

export type NotifyKind = "progress_notes" | "expenses" | "travel" | "incidents";

type Org = { id: string; name: string; brand_primary: string; custom_domain: string | null; domain_status: string };

/** Email the organisation's managers about something a worker logged.
 *  Who gets it: owners and admins (on by default) and coordinators who opted
 *  in, per their preference for this kind. `always` sends to every owner and
 *  admin regardless of preference (used for reportable/serious incidents).
 *  The person who logged it is never emailed about their own entry. */
export async function notifyManagers(opts: {
  org: Org; kind: NotifyKind; actorId: string; subject: string; heading: string;
  rows: [string, string][]; body?: string; linkPath: string; linkLabel: string; always?: boolean;
}) {
  const admin = createServiceClient();
  const { data } = await admin.from("org_members")
    .select(`user_id, role, notify_${opts.kind}, profile:profiles(email)`)
    .eq("organisation_id", opts.org.id).eq("status", "active").in("role", ["owner", "admin", "coordinator"]);

  type M = { user_id: string; role: string; profile: { email: string } | null } & Record<string, unknown>;
  const recipients = ((data ?? []) as unknown as M[]).filter((m) => {
    if (m.user_id === opts.actorId || !m.profile?.email) return false;
    const isAdmin = m.role === "owner" || m.role === "admin";
    if (opts.always && isAdmin) return true;
    const pref = m[`notify_${opts.kind}`] as boolean | null;
    return pref ?? isAdmin;
  });
  if (!recipients.length) return;

  const link = `${portalUrl(opts.org)}${opts.linkPath}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1C2B33">
      <p style="margin:0 0 4px;color:#5b6673;font-size:13px">${escapeHtml(opts.org.name)}</p>
      <h2 style="margin:0 0 14px;font-size:20px">${escapeHtml(opts.heading)}</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:12px">
        ${opts.rows.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#5b6673;vertical-align:top">${escapeHtml(k)}</td><td style="padding:3px 0">${escapeHtml(v)}</td></tr>`).join("")}
      </table>
      ${opts.body ? `<div style="white-space:pre-wrap;background:#FAF5EE;border-radius:10px;padding:12px 14px;font-size:14px;margin-bottom:14px">${escapeHtml(opts.body)}</div>` : ""}
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:${opts.org.brand_primary};color:#fff;border-radius:10px;text-decoration:none">${escapeHtml(opts.linkLabel)}</a></p>
      <p style="color:#5b6673;font-size:12px">Change which emails you get in My profile → Email notifications.</p>
    </div>`;
  await Promise.all(recipients.map((m) => sendEmail(m.profile!.email, opts.subject, html)));
}
