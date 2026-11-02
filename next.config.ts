import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Server actions default to a 1 MB request limit, which silently blocks
  // logo (2 MB) and receipt photo (8 MB) uploads.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;

initOpenNextCloudflareForDev();
