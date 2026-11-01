import "server-only";
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export type PushPayload = { title: string; body: string; url?: string };

/** Send a push notification to every device a user has enabled.
 *  Expired subscriptions (404/410 from the push service) are removed. */
export async function sendPushToUser(admin: SupabaseClient, userId: string, payload: PushPayload) {
  const vapid = env.vapid();
  if (!vapid) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK: JSON.parse(vapid.privateJwk),
        subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message: { payload, adminContact: vapid.contact, options: { ttl: 12 * 3600, urgency: "normal" } },
      });
      const res = await fetch(endpoint, { method: "POST", headers, body });
      if (res.status === 404 || res.status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else if (res.ok) sent++;
    } catch {
      // ignore a single bad subscription
    }
  }
  return sent;
}
