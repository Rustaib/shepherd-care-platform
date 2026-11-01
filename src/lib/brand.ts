import type { CSSProperties } from "react";
import type { Organisation } from "@/lib/org";

/** Pick black or white text for legibility on a given background colour. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#111111" : "#ffffff";
}

/** CSS variables that re-skin the whole app for an organisation. */
export function brandStyle(org: Pick<Organisation, "brand_primary" | "brand_secondary" | "brand_accent">): CSSProperties {
  return {
    "--brand-primary": org.brand_primary,
    "--brand-primary-fg": readableOn(org.brand_primary),
    "--brand-secondary": org.brand_secondary,
    "--brand-accent": org.brand_accent,
  } as CSSProperties;
}
