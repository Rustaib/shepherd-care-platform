import "server-only";
import { env } from "@/lib/env";

/** Cloudflare for SaaS — custom hostnames with automatic SSL.
 *  https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/ */

export type CustomHostname = {
  id: string;
  hostname: string;
  status: string;                       // "active" | "pending" | "moved" | ...
  ssl?: { status?: string; validation_errors?: { message: string }[] };
  verification_errors?: string[];
};

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = env.cloudflare();
  if (!cfg) throw new Error("Custom domains aren't configured on this server yet.");
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfg.zoneId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = (await res.json()) as { success: boolean; result: T; errors?: { message: string }[] };
  if (!body.success) throw new Error(body.errors?.map((e) => e.message).join("; ") || `Cloudflare error ${res.status}`);
  return body.result;
}

export const createCustomHostname = (hostname: string) =>
  cf<CustomHostname>("/custom_hostnames", {
    method: "POST",
    body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } }),
  });

export const getCustomHostname = (id: string) => cf<CustomHostname>(`/custom_hostnames/${id}`);

export const deleteCustomHostname = (id: string) => cf<{ id: string }>(`/custom_hostnames/${id}`, { method: "DELETE" });

/** Map Cloudflare's state onto ours. */
export function toDomainStatus(h: CustomHostname): "pending" | "active" | "error" {
  if (h.status === "active" && h.ssl?.status === "active") return "active";
  if (h.status === "blocked" || h.status === "moved") return "error";
  return "pending";
}
