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
