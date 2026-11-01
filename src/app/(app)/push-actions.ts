"use server";
import { z } from "zod";
import { requireUser } from "@/lib/org";

const sub = z.object({
  endpoint: z.url().refine((u) => u.startsWith("https://"), "Invalid endpoint"),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
});

export async function savePushSubscription(json: unknown, userAgent: string) {
  const parsed = sub.safeParse(json);
  if (!parsed.success) return { error: "Invalid subscription" };
  const { supabase, user } = await requireUser();
  // An endpoint belongs to one browser; re-point it to the current user.
  await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  return error ? { error: error.message } : { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const { supabase } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}
