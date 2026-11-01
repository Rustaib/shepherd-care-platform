import Link from "next/link";
import { ageFrom, displayName, formatDate } from "@/lib/ndis";
import { requireManager, requireUser } from "@/lib/org";

export const metadata = { title: "Participants" };

type Row = {
  id: string; first_name: string; last_name: string; preferred_name: string | null;
  ndis_number: string | null; date_of_birth: string | null; suburb: string | null; status: string;
  ndis_plans: { start_date: string; end_date: string }[];
};

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

export default async function Participants({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "active" } = await searchParams;
  const { organisation: org } = await requireManager();
  const { supabase } = await requireUser();

  let query = supabase.from("participants")
    .select("id,first_name,last_name,preferred_name,ndis_number,date_of_birth,suburb,status,ndis_plans(start_date,end_date)")
    .eq("organisation_id", org.id)
    .order("last_name").order("first_name");
  if (STATUSES.some((s) => s.value === status)) query = query.eq("status", status);
  const term = q.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim();
  if (term) query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,preferred_name.ilike.%${term}%,ndis_number.ilike.%${term}%`);
  const { data: rows } = await query.returns<Row[]>();

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
        <Link href="/participants/new" className="btn-primary">+ Add participant</Link>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search name or NDIS number" className="field" aria-label="Search participants" />
        <select name="status" defaultValue={status} className="field sm:w-40" aria-label="Status">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="btn-ghost">Search</button>
      </form>

      {!rows?.length ? (
        <div className="card text-center text-sm text-muted">
          {term ? "No participants match your search." : "No participants yet."}
          {!term && status === "active" && <div className="mt-3"><Link href="/participants/new" className="btn-primary">Add your first participant</Link></div>}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => {
            const current = p.ndis_plans.find((pl) => pl.start_date <= today && pl.end_date >= today);
            const ending = current && current.end_date <= soon;
            const age = ageFrom(p.date_of_birth);
            return (
              <li key={p.id}>
                <Link href={`/participants/${p.id}`} className="card flex items-center gap-4 transition hover:border-brand">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 font-semibold text-brand">
                    {p.first_name[0]}{p.last_name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{displayName(p)}</div>
                    <div className="truncate text-sm text-muted">
                      {[p.ndis_number && `NDIS ${p.ndis_number}`, age !== null && `${age} yrs`, p.suburb].filter(Boolean).join(" · ") || "No details yet"}
                    </div>
                  </div>
                  {!current ? <span className="badge text-danger">No current plan</span>
                    : ending ? <span className="badge bg-accent/15 text-ink">Plan ends {formatDate(current.end_date)}</span>
                    : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
