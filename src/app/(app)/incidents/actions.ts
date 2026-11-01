"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { escapeHtml, sendEmail } from "@/lib/email";
import { categoryByValue, INCIDENT_CATEGORIES } from "@/lib/incidents";
import { requireManager, requireMembership, requireUser } from "@/lib/org";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidDate, isValidTime, localToUtc } from "@/lib/time";
import { portalUrl } from "@/lib/tenant";

export type IncidentState = { error?: string } | undefined;

const schema = z.object({
  shift_id: z.string().transform((v) => v || null).pipe(z.uuid().nullable()),
  participant_id: z.string().transform((v) => v || null).pipe(z.uuid().nullable()),
  category: z.enum(INCIDENT_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  date: z.string().refine(isValidDate, "Choose the date it happened"),
  time: z.string().refine(isValidTime, "Choose the time it happened"),
  location: z.string().trim().transform((v) => v || null),
  description: z.string().trim().min(20, "Describe what happened (at least 20 characters)"),
  immediate_action: z.string().trim().min(5, "Say what was done straight away"),
  witnesses: z.string().trim().transform((v) => v || null),
});

export async function reportIncident(_: IncidentState, formData: FormData): Promise<IncidentState> {
  const { organisation: org } = await requireMembership();
  const { supabase, user } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const cat = categoryByValue(d.category)!;
  const occurred_at = localToUtc(d.date, d.time, org.timezone);
  if (Date.parse(occurred_at) > Date.now() + 5 * 60e3) return { error: "The time can't be in the future." };

  const { data, error } = await supabase.from("incident_reports").insert({
    organisation_id: org.id, shift_id: d.shift_id, participant_id: d.participant_id, reported_by: user.id,
    occurred_at, location: d.location, category: d.category, severity: d.severity,
    description: d.description, immediate_action: d.immediate_action, witnesses: d.witnesses,
    is_reportable: cat.reportable,
  }).select("id").single();
  if (error) return { error: error.message };

  // Alert managers by email for reportable or serious incidents
  if (cat.reportable || d.severity === "high" || d.severity === "critical") {
    const admin = createServiceClient();
    const { data: managers } = await admin.from("org_members").select("profile:profiles(email)")
      .eq("organisation_id", org.id).eq("status", "active").in("role", ["owner", "admin", "coordinator"]);
    const link = `${portalUrl(org)}/incidents/${data.id}`;
    const subject = `${cat.reportable ? "REPORTABLE " : ""}incident: ${cat.label}`;
    const html = `<p><strong>${escapeHtml(cat.label)}</strong> (severity: ${d.severity}) was reported.</p>
      ${cat.reportable ? `<p style="color:#b42318"><strong>This may be reportable to the NDIS Commission within ${cat.notifyWithin === "24_hours" ? "24 hours" : "5 business days"}.</strong></p>` : ""}
      <p>${escapeHtml(d.description).slice(0, 500)}</p><p><a href="${link}">Open the incident report</a></p>`;
    const emails = ((managers ?? []) as unknown as { profile: { email: string } }[]).map((m) => m.profile.email);
    await Promise.all(emails.map((e) => sendEmail(e, subject, html)));
  }
  revalidatePath("/incidents");
  redirect(`/incidents/${data.id}?submitted=1`);
}

const reviewSchema = z.object({
  status: z.enum(["open", "under_review", "reported_to_commission", "closed"]),
  review_notes: z.string().trim().transform((v) => v || null),
  is_reportable: z.string().optional().transform((v) => v === "on"),
  commission_notified: z.string().optional().transform((v) => v === "on"),
});

export async function reviewIncident(id: string, _: IncidentState, formData: FormData): Promise<IncidentState> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data: current } = await supabase.from("incident_reports").select("commission_notified_at").eq("id", id).single();
  const notifiedAt = parsed.data.commission_notified ? (current?.commission_notified_at ?? new Date().toISOString()) : null;
  const { error } = await supabase.from("incident_reports").update({
    status: parsed.data.commission_notified && parsed.data.status === "open" ? "reported_to_commission" : parsed.data.status,
    review_notes: parsed.data.review_notes,
    is_reportable: parsed.data.is_reportable,
    commission_notified_at: notifiedAt,
    reviewed_by: user.id,
  }).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: error.message };
  revalidatePath(`/incidents/${id}`);
  revalidatePath("/incidents");
  return undefined;
}
