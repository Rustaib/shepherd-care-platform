"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org";

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter your name"),
  name: z.string().trim().min(2, "Enter your organisation's name").max(120),
  state: z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]),
});

export type FormState = { error?: string } | undefined;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";

export async function createOrganisation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);

  const base = slugify(parsed.data.name);
  const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: orgId, error } = await supabase.rpc("create_organisation", {
    p_name: parsed.data.name, p_slug: slug, p_state: parsed.data.state,
  });
  if (error) return { error: error.message };

  (await cookies()).set(ORG_COOKIE, orgId as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/admin/settings");
}
