export const SUPPORT_GROUPS = [
  {
    group: "Core supports",
    items: [
      { value: "assistance_daily_life", label: "Assistance with Daily Life" },
      { value: "transport", label: "Transport" },
      { value: "consumables", label: "Consumables" },
      { value: "assistance_social_community", label: "Assistance with Social, Economic & Community Participation" },
    ],
  },
  {
    group: "Capital supports",
    items: [
      { value: "assistive_technology", label: "Assistive Technology" },
      { value: "home_modifications", label: "Home Modifications & SDA" },
    ],
  },
  {
    group: "Capacity building",
    items: [
      { value: "support_coordination", label: "Support Coordination" },
      { value: "improved_living_arrangements", label: "Improved Living Arrangements" },
      { value: "increased_social_community_participation", label: "Increased Social & Community Participation" },
      { value: "finding_keeping_job", label: "Finding & Keeping a Job" },
      { value: "improved_relationships", label: "Improved Relationships" },
      { value: "improved_health_wellbeing", label: "Improved Health & Wellbeing" },
      { value: "improved_learning", label: "Improved Learning" },
      { value: "improved_life_choices", label: "Improved Life Choices (Plan Management)" },
      { value: "improved_daily_living", label: "Improved Daily Living Skills" },
    ],
  },
] as const;

export type SupportCategory = (typeof SUPPORT_GROUPS)[number]["items"][number]["value"];
export const SUPPORT_CATEGORIES = SUPPORT_GROUPS.flatMap((g) => g.items.map((i) => i.value as string)) as SupportCategory[];
const ALL_ITEMS: readonly { value: string; label: string }[] = SUPPORT_GROUPS.flatMap((g) => [...g.items]);
export const categoryLabel = (v: string) => ALL_ITEMS.find((i) => i.value === v)?.label ?? v;

export const MANAGEMENT_LABEL: Record<string, string> = {
  ndia_managed: "NDIA-managed",
  plan_managed: "Plan-managed",
  self_managed: "Self-managed",
};

export const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
export const money = (n: number | string | null | undefined) => aud.format(Number(n ?? 0));

export function ageFrom(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function displayName(p: { first_name: string; last_name: string; preferred_name?: string | null }) {
  return p.preferred_name ? `${p.preferred_name} ${p.last_name}` : `${p.first_name} ${p.last_name}`;
}
