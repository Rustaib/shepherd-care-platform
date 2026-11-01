"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getMemberships, ORG_COOKIE } from "@/lib/org";

export async function switchOrganisation(orgId: string) {
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.organisation.id === orgId)) return;
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
