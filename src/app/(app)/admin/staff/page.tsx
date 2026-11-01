import { isAdmin, requireManager } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation, setMemberRole, setMemberStatus } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Staff" };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", coordinator: "Coordinator", staff: "Support worker" };

type Member = { id: string; role: string; status: string; created_at: string; profile: { full_name: string; email: string; phone: string | null } };
type Invite = { id: string; email: string; role: string; expires_at: string };

export default async function StaffPage() {
  const { role, organisation: org } = await requireManager();
  const canEdit = isAdmin(role);
  const supabase = await createClient();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("org_members").select("id,role,status,created_at,profile:profiles(full_name,email,phone)")
      .eq("organisation_id", org.id).order("created_at").returns<Member[]>(),
    canEdit
      ? supabase.from("invitations").select("id,email,role,expires_at").eq("organisation_id", org.id)
          .is("accepted_at", null).order("created_at", { ascending: false }).returns<Invite[]>()
      : Promise.resolve({ data: [] as Invite[] }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
      {canEdit && <InviteForm />}

      {canEdit && !!invites?.length && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Pending invitations</h2>
          <ul className="divide-y divide-line">
            {invites.map((i) => {
              const expired = new Date(i.expires_at) < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.email}</div>
                    <div className="text-sm text-muted">{ROLE_LABEL[i.role]} · {expired ? "Expired" : `Expires ${new Date(i.expires_at).toLocaleDateString("en-AU")}`}</div>
                  </div>
                  <form action={revokeInvitation.bind(null, i.id)}><button className="btn-ghost px-3 py-1.5 text-danger">{expired ? "Remove" : "Revoke"}</button></form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Team ({members?.length ?? 0})</h2>
        <ul className="divide-y divide-line">
          {members?.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 font-semibold text-brand">
                {(m.profile.full_name || m.profile.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.profile.full_name || "—"}</div>
                <div className="truncate text-sm text-muted">{m.profile.email}{m.profile.phone ? ` · ${m.profile.phone}` : ""}</div>
              </div>
              {m.status === "suspended" && <span className="badge text-danger">Suspended</span>}
              {canEdit && m.role !== "owner" ? (
                <div className="flex items-center gap-2">
                  <form action={async (fd: FormData) => { "use server"; await setMemberRole(m.id, fd.get("role") as "staff" | "coordinator" | "admin"); }} className="flex gap-2">
                    <select name="role" defaultValue={m.role} className="field py-1.5 text-sm" aria-label="Role">
                      <option value="staff">Support worker</option>
                      <option value="coordinator">Coordinator</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="btn-ghost px-3 py-1.5">Save</button>
                  </form>
                  <form action={setMemberStatus.bind(null, m.id, m.status === "active" ? "suspended" : "active")}>
                    <button className="btn-ghost px-3 py-1.5">{m.status === "active" ? "Suspend" : "Reactivate"}</button>
                  </form>
                </div>
              ) : (
                <span className="badge">{ROLE_LABEL[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
