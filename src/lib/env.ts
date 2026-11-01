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
  cloudflare: () => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const cnameTarget = process.env.CUSTOM_DOMAIN_CNAME_TARGET;
    return token && zoneId && cnameTarget ? { token, zoneId, cnameTarget } : null;
  },
};
