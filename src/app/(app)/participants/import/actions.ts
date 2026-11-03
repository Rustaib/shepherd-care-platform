"use server";
import { revalidatePath } from "next/cache";
import type { CsvImportState } from "@/components/csv-import-form";
import { requireManager, requireUser } from "@/lib/org";
import { parseParticipants, type ParticipantImport } from "@/lib/people-import";
import { todayIn } from "@/lib/time";

const listNotes = (notes: string[]) => notes.slice(0, 20).concat(notes.length > 20 ? [`…and ${notes.length - 20} more`] : []);
const key = (first: string, last: string, dob: string | null) => `${first}|${last}|${dob ?? ""}`.toLowerCase().replace(/\s+/g, " ");

export async function importParticipants(_: CsvImportState, formData: FormData): Promise<CsvImportState> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!file || typeof file === "string" || typeof (file as Blob).text !== "function" || !(file as Blob).size) return { error: "Choose a CSV file to import." };
  if ((file as Blob).size > 5_000_000) return { error: "That file is over 5 MB — is it the right one?" };
  const { rows, errors, warnings } = parseParticipants(await (file as Blob).text());
  if (!rows.length) return { error: errors[0] ?? "No participants found in that file.", notes: listNotes(errors.slice(1)) };
  const updateExisting = formData.get("update_existing") === "on";

  const { data: existing, error: exErr } = await supabase.from("participants")
    .select("id,first_name,last_name,date_of_birth,ndis_number,external_ref,ndis_plans(start_date)").eq("organisation_id", org.id);
  if (exErr) return { error: exErr.message };
  type Ex = { id: string; first_name: string; last_name: string; date_of_birth: string | null; ndis_number: string | null; external_ref: string | null; ndis_plans: { start_date: string }[] };
  const ex = (existing ?? []) as Ex[];
  const byRef = new Map(ex.filter((p) => p.external_ref).map((p) => [p.external_ref!, p]));
  const byNdis = new Map(ex.filter((p) => p.ndis_number).map((p) => [p.ndis_number!, p]));
  const byName = new Map(ex.map((p) => [key(p.first_name, p.last_name, p.date_of_birth), p]));

  const today = todayIn(org.timezone);
  const notes = [...errors, ...warnings];
  let added = 0, updated = 0, skipped = 0, plans = 0;

  const addPlan = async (participantId: string, r: ParticipantImport, has: { start_date: string }[]) => {
    if (!r.plan || has.some((p) => p.start_date === r.plan!.start_date)) return;
    const { error } = await supabase.from("ndis_plans").insert({
      organisation_id: org.id, participant_id: participantId, ...r.plan,
      management_type: r.management_type ?? "plan_managed", status: r.plan.end_date < today ? "expired" : "active",
    });
    if (error) notes.push(`${r.first_name} ${r.last_name}: plan not added — ${error.message}`); else plans++;
  };

  for (const r of rows) {
    const who = `${r.first_name} ${r.last_name}`;
    const { plan: _plan, ...fields } = r;
    const match = (r.external_ref && byRef.get(r.external_ref)) || (r.ndis_number && byNdis.get(r.ndis_number)) || byName.get(key(r.first_name, r.last_name, r.date_of_birth));
    if (match) {
      if (!updateExisting) { skipped++; continue; }
      // Only fill in what the file has; never blank out existing details
      const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && v !== "" && !(k === "last_name" && v === "-")));
      const { error } = await supabase.from("participants").update(patch).eq("id", match.id).eq("organisation_id", org.id);
      if (error) { notes.push(`${who}: ${error.code === "23505" ? "NDIS number or ID already used by another participant" : error.message}`); continue; }
      updated++;
      await addPlan(match.id, r, match.ndis_plans);
    } else {
      const { data, error } = await supabase.from("participants").insert({ ...fields, organisation_id: org.id, created_by: user.id }).select("id").single();
      if (error) { notes.push(`${who}: ${error.code === "23505" ? "NDIS number or ID already used by another participant" : error.message}`); continue; }
      added++;
      const created = { ...fields, id: data.id, ndis_plans: [] } as unknown as Ex;
      if (r.external_ref) byRef.set(r.external_ref, created);
      if (r.ndis_number) byNdis.set(r.ndis_number, created);
      byName.set(key(r.first_name, r.last_name, r.date_of_birth), created);
      await addPlan(data.id, r, []);
    }
  }
  revalidatePath("/participants");
  const parts = [added && `${added} added`, updated && `${updated} updated`, skipped && `${skipped} already here (left as they were)`, plans && `${plans} plan${plans === 1 ? "" : "s"} added`].filter(Boolean).join(", ");
  return { ok: `Imported ${rows.length} participant${rows.length === 1 ? "" : "s"}: ${parts || "nothing to change"}.`, notes: listNotes(notes), next: { href: "/participants", label: "View participants" } };
}
