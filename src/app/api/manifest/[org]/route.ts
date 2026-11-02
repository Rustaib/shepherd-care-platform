import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assetUrl } from "@/lib/org";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/** Web app manifest per organisation. Browsers fetch manifests without
 *  cookies, so the organisation is part of the URL (set in the root layout). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  let name = "Hoiva", short = "Hoiva", theme = "#11606B", icons = DEFAULT_ICONS;

  if (UUID.test(org)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("org_app_manifest", { p_org: org });
    const o = (data as { name: string; app_name: string | null; brand_primary: string; app_icon_path: string | null }[] | null)?.[0];
    if (o) {
      name = o.app_name || o.name;
      short = name.length > 12 ? name.split(" ")[0].slice(0, 12) : name;
      theme = o.brand_primary;
      const icon = assetUrl(o.app_icon_path);
      if (icon) {
        icons = [
          { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ];
      }
    }
  }

  return NextResponse.json(
    {
      id: `/app/${UUID.test(org) ? org : "hoiva"}`,
      name, short_name: short,
      description: "Shifts, progress notes and timesheets",
      start_url: "/dashboard", scope: "/", display: "standalone",
      background_color: "#FAF5EE", theme_color: theme, icons,
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } },
  );
}
