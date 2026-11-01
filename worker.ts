// Cloudflare Worker entry: the OpenNext-built Next.js app plus a cron handler.
// The cron trigger in wrangler.jsonc runs hourly; each organisation's reminders
// go out at its own local reminder hour (default 6pm).
// @ts-expect-error — generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

type Env = { APP_URL: string; CRON_SECRET: string };

export default {
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const request = new Request(`${env.APP_URL}/api/cron/reminders`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};

// @ts-expect-error — generated at build time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
