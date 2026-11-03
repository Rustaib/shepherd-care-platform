import "server-only";
import { env } from "@/lib/env";

/** Sends email through Resend (resend.com — free tier covers a small provider).
 *  Returns false when no API key is configured so callers can fall back. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = env.resendApiKey();
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom(), to, subject, html }),
    });
    if (!res.ok) console.error(`Email to ${to} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  } catch (e) {
    console.error(`Email to ${to} failed: ${(e as Error).message}`);
    return false;
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type Attachment = { filename: string; content: Uint8Array };

function toBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Send one email to several recipients with attachments. Returns Resend's
 *  error message on failure so it can be shown to the person sending. */
export async function sendEmailWithAttachments(opts: {
  to: string[]; cc?: string[]; replyTo?: string | null; subject: string; text: string; html: string; attachments: Attachment[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = env.resendApiKey();
  if (!key) return { ok: false, error: "Email isn't set up on this server (RESEND_API_KEY missing)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.emailFrom(), to: opts.to, cc: opts.cc?.length ? opts.cc : undefined,
        reply_to: opts.replyTo || undefined, subject: opts.subject, text: opts.text, html: opts.html,
        attachments: opts.attachments.map((a) => ({ filename: a.filename, content: toBase64(a.content) })),
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    console.error(`Email to ${opts.to.join(", ")} failed (${res.status}): ${body.slice(0, 300)}`);
    let message = body;
    try { message = (JSON.parse(body) as { message?: string }).message ?? body; } catch { /* not JSON */ }
    return { ok: false, error: message.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
