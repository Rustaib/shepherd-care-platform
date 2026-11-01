function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  resendApiKey: () => process.env.RESEND_API_KEY,
  emailFrom: () => process.env.EMAIL_FROM ?? "no-reply@example.com",
  /** Hostname of the platform itself, e.g. app.careplatform.com.au */
  platformHost: () => new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").host,
  vapid: () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateJwk = process.env.VAPID_PRIVATE_JWK;
    return publicKey && privateJwk ? { publicKey, privateJwk, contact: process.env.VAPID_CONTACT ?? "mailto:support@example.com" } : null;
  },
  cronSecret: () => process.env.CRON_SECRET,
  stripe: () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID;
    return secretKey && priceId
      ? { secretKey, priceId, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "", perSeat: process.env.STRIPE_PER_SEAT === "true" }
      : null;
  },
  cloudflare: () => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const cnameTarget = process.env.CUSTOM_DOMAIN_CNAME_TARGET;
    return token && zoneId && cnameTarget ? { token, zoneId, cnameTarget } : null;
  },
};
