import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NDIS_PRICE_GUIDE_CSV } from "./data/ndis-price-guide";
import { parsePriceBook, serviceKey, type ServiceInput } from "./price-guide";

export type ImportSummary = { created: number; updated: number; unchanged: number; errors: string[] };

export const defaultPriceGuide = (today: string) => parsePriceBook(NDIS_PRICE_GUIDE_CSV, today).services;

/** Create services that don't exist yet and overwrite the prices of ones that do (matched by name,
 *  ignoring the category prefix, case and punctuation). `onlyNew` leaves existing services alone. */
export async function upsertServices(supabase: SupabaseClient, orgId: string, incoming: ServiceInput[], onlyNew = false): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, unchanged: 0, errors: [] };
  const { data: existing, error } = await supabase.from("services").select("id,name,sort_order").eq("organisation_id", orgId);
  if (error) return { ...summary, errors: [error.message] };
  const byKey = new Map((existing ?? []).map((s) => [serviceKey(s.name), s]));
  let order = Math.max(0, ...(existing ?? []).map((s) => s.sort_order ?? 0));
  const inserts: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const s of incoming) {
    const key = serviceKey(s.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const match = byKey.get(key);
    if (match) {
      if (onlyNew) { summary.unchanged++; continue; }
      const { name: _n, ...prices } = s;
      const { error: e } = await supabase.from("services").update(prices).eq("id", match.id).eq("organisation_id", orgId);
      if (e) summary.errors.push(`${s.name}: ${e.message}`); else summary.updated++;
    } else {
      inserts.push({ ...s, organisation_id: orgId, sort_order: ++order, active: true });
    }
  }
  if (inserts.length) {
    const { error: e } = await supabase.from("services").insert(inserts);
    if (e) summary.errors.push(e.message); else summary.created += inserts.length;
  }
  return summary;
}
