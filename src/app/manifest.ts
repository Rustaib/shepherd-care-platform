import type { MetadataRoute } from "next";
import { getHostTenant } from "@/lib/tenant";

// Per-domain manifest: on a customer's domain the installed app is named and
// coloured after that organisation.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getHostTenant();
  const name = tenant?.name ?? "Care Platform";
  return {
    name,
    short_name: name.length > 12 ? name.split(" ")[0] : name,
    description: "Shifts, progress notes and timesheets",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: tenant?.brand_primary ?? "#1f4e79",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
