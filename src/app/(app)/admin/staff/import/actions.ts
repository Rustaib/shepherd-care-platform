"use server";
import { revalidatePath } from "next/cache";
import type { CsvImportState } from "@/components/csv-import-form";
import { requireAdmin } from "@/lib/org";
import { parseStaff } from "@/lib/people-import";
import { createClient } from "@/lib/supabase/server";
import { sendInvitations } from "../actions";

const MAX = 2_000_000;
const listNotes = (notes: string[]) => notes.slice(0, 15).concat(notes.length > 15 ? [`…and ${notes.length - 15} more`] : []);

/** Staff from a CSV become invitations that aren't sent until an admin chooses to. */
export async function importStaff(_: CsvImportState, formData: FormData): Promise<CsvImportState> {
  const { organisation: org } = await requireAdmin();
  const file = formData.get("file");
  if (!file || typeof file === "string" || typeof (file as Blob).text !== "function" || !(file as Blob).size) return { error: "Choose a CSV file to import." };
  if ((file as Blob).size > MAX) return { error: "That file is over 2 MB — is it the right one?" };
  const { rows, errors, warnings } = parseStaff(await (file as Blob).text());
  if (!rows.length) return { error: errors[0] ?? "No staff found in that file.", notes: listNotes(errors.slice(1)) };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("org_members").select("profile:profiles(email)").eq("organisation_id", org.id).returns<{ profile: { email: string } | null }[]>(),
    supabase.from("invitations").select("id,email,sent_at").eq("organisation_id", org.id).is("accepted_at", null),
  ]);
  const memberEmails = new Set((members ?? []).map((m) => m.profile?.email.toLowerCase()).filter(Boolean));
  const openInvites = new Map((invites ?? []).map((i) => [i.email, i]));

  let added = 0, updated = 0, onTeam = 0;
  const notes = [...errors, ...warnings];
  const fresh = rows.filter((r) => {
    if (memberEmails.has(r.email)) { onTeam++; return false; }
    return true;
  });
  const toInsert = fresh.filter((r) => !openInvites.has(r.email));
  for (const r of fresh.filter((x) => openInvites.has(x.email))) {
    const { error } = await supabase.from("invitations").update({ full_name: r.full_name || null, phone: r.phone, role: r.role, employment_type: r.employment_type, external_ref: r.external_ref })
      .eq("id", openInvites.get(r.email)!.id);
    if (error) notes.push(`${r.email}: ${error.message}`); else updated++;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("invitations").insert(toInsert.map((r) => ({
      organisation_id: org.id, email: r.email, role: r.role, full_name: r.full_name || null, phone: r.phone,
      employment_type: r.employment_type, external_ref: r.external_ref, invited_by: user!.id, sent_at: null,
    })));
    if (error) return { error: error.message };
    added = toInsert.length;
  }

  let sentMsg = "";
  if (formData.get("send_now") === "on" && added + updated > 0) {
    const r = await sendInvitations("all-unsent");
    sentMsg = r.error ? ` Sending failed: ${r.error}` : ` ${r.ok}`;
  }
  revalidatePath("/admin/staff");
  const parts = [added && `${added} added`, updated && `${updated} updated`, onTeam && `${onTeam} already on the team`].filter(Boolean).join(", ");
  return {
    ok: `Imported ${rows.length} staff: ${parts || "nothing to change"}.${sentMsg}`,
    notes: listNotes(notes),
    next: { href: "/admin/staff", label: sentMsg ? "Back to Staff" : "Review and send invitations" },
  };
}
