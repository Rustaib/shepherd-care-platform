"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { escapeHtml, sendEmailWithAttachments } from "@/lib/email";
import { createInvoices, getInvoiceSettings, storeInvoicePdf } from "@/lib/invoicing";
import { requireManager, requireUser } from "@/lib/org";
import { isValidDate } from "@/lib/time";

export type Result = { error?: string; ok?: string } | undefined;

export async function generateInvoices(_: Result, formData: FormData): Promise<Result> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const from = String(formData.get("from")), to = String(formData.get("to")), issue = String(formData.get("issue_date") || "");
  const ids = formData.getAll("participant").map(String).filter((x) => z.uuid().safeParse(x).success);
  if (!isValidDate(from) || !isValidDate(to) || to < from) return { error: "Choose a valid period." };
  if (issue && !isValidDate(issue)) return { error: "Choose a valid issue date." };
  if (!ids.length) return { error: "Tick at least one participant." };
  try {
    const { created } = await createInvoices(supabase, org, user.id, from, to, ids, issue || undefined);
    revalidatePath("/invoices");
    if (!created.length) return { error: "Nothing to invoice for those participants in that period." };
    redirect(`/invoices?created=${created.length}&from=${from}&to=${to}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { error: (e as Error).message };
  }
}

const emailList = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function sendInvoice(id: string, _: Result, formData: FormData): Promise<Result> {
  const { organisation: org } = await requireManager();
  const { supabase, user } = await requireUser();
  const to = emailList(String(formData.get("to") ?? "")), cc = emailList(String(formData.get("cc") ?? ""));
  const subject = String(formData.get("subject") ?? "").trim(), body = String(formData.get("body") ?? "").trim();
  if (!to.length) return { error: "Add at least one recipient." };
  const bad = [...to, ...cc].find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" isn't a valid email address.` };
  if (to.length + cc.length > 20) return { error: "Too many recipients (20 max)." };
  if (!subject || !body) return { error: "Add a subject and a message." };

  const { data: inv } = await supabase.from("invoices").select("id,invoice_number,status,pdf_path").eq("id", id).eq("organisation_id", org.id).single();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status === "void") return { error: "This invoice is void." };

  let pdf: Uint8Array | null = null;
  if (inv.pdf_path) {
    const { data } = await supabase.storage.from("invoices").download(inv.pdf_path);
    if (data) pdf = new Uint8Array(await data.arrayBuffer());
  }
  pdf ??= await storeInvoicePdf(supabase, org, id);

  const settings = await getInvoiceSettings(supabase, org.id);
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1C2B33;white-space:pre-wrap">${escapeHtml(body)}</div>`;
  const res = await sendEmailWithAttachments({
    to, cc, replyTo: settings.email, subject, text: body, html,
    attachments: [{ filename: `${settings.title.replace(/\s+/g, "-")}-${inv.invoice_number}.pdf`, content: pdf }],
  });
  if (!res.ok) return { error: `The email wasn't sent: ${res.error}` };

  await supabase.from("invoices").update({
    status: inv.status === "paid" ? "paid" : "sent", sent_at: new Date().toISOString(), sent_to: [...to, ...cc], sent_by: user.id,
  }).eq("id", id);
  revalidatePath(`/invoices/${id}`); revalidatePath("/invoices");
  return { ok: `Sent to ${[...to, ...cc].join(", ")}.` };
}

export async function setInvoiceStatus(id: string, status: "generated" | "sent" | "paid", paidOn?: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = { status };
  if (status === "paid") update.paid_at = paidOn && isValidDate(paidOn) ? paidOn : new Date().toISOString().slice(0, 10);
  if (status !== "paid") update.paid_at = null;
  await supabase.from("invoices").update(update).eq("id", id).eq("organisation_id", org.id).neq("status", "void");
  revalidatePath(`/invoices/${id}`); revalidatePath("/invoices");
}

export async function voidInvoice(id: string, _: Result, formData: FormData): Promise<Result> {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Say why the invoice is being voided." };
  await supabase.from("invoices").update({ status: "void", void_reason: reason }).eq("id", id).eq("organisation_id", org.id);
  revalidatePath(`/invoices/${id}`); revalidatePath("/invoices");
  return { ok: "Invoice voided. Its shifts can now be invoiced again." };
}

export async function regeneratePdf(id: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  await storeInvoicePdf(supabase, org, id);
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string) {
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();
  const { data } = await supabase.from("invoices").select("status,pdf_path").eq("id", id).eq("organisation_id", org.id).single();
  if (!data || data.status !== "generated") return; // only never-sent invoices can be deleted
  if (data.pdf_path) await supabase.storage.from("invoices").remove([data.pdf_path]);
  await supabase.from("invoices").delete().eq("id", id).eq("organisation_id", org.id);
  revalidatePath("/invoices");
  redirect("/invoices");
}
