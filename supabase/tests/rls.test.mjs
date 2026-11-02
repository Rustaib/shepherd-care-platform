// Security tests for the database schema: tenant isolation, role permissions,
// staff need-to-know access, approvals and audit logging. Runs against an
// in-memory Postgres (PGlite) with minimal Supabase auth/storage stubs.
// Usage: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? new URL("../migrations", import.meta.url).pathname;
const db = new PGlite({ extensions: { btree_gist } });

// --- Minimal Supabase stubs -------------------------------------------------
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
-- Mirror Supabase defaults: tables are granted to API roles when created,
-- so a migration's REVOKE is what actually restricts them.
grant usage on schema public to authenticated, anon;
-- No default table privileges: mirrors new Supabase projects, where tables are
-- not exposed automatically, so the migrations' explicit grants are tested.
alter default privileges in schema public revoke execute on functions from public;
`);

for (const f of fs.readdirSync(dir).sort()) {
  try { await db.exec(fs.readFileSync(path.join(dir, f), "utf8")); console.log("applied", f); }
  catch (e) { console.error("FAILED", f, e.message); process.exit(1); }
}


// --- Behaviour tests --------------------------------------------------------
const U = { owner: "00000000-0000-0000-0000-000000000001", staff: "00000000-0000-0000-0000-000000000002",
            staff2: "00000000-0000-0000-0000-000000000003", other: "00000000-0000-0000-0000-000000000004" };
await db.exec(`insert into auth.users (id,email) values
 ('${U.owner}','owner@a.com'),('${U.staff}','staff@a.com'),('${U.staff2}','staff2@a.com'),('${U.other}','other@b.com');`);

let failures = 0;
const as = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  return db.query(sql);
};
const expect = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) failures++; };
const throws = async (name, fn) => { try { await fn(); expect(name, false); } catch { expect(name, true); } };

const org = (await as(U.owner, `select public.create_organisation('Shepherd Care','shepherd-care','NSW') id`)).rows[0].id;
const orgB = (await as(U.other, `select public.create_organisation('Other Co','other-co','VIC') id`)).rows[0].id;
expect("profiles auto-created", (await as(U.owner, `select count(*)::int n from profiles where id='${U.owner}'`)).rows[0].n === 1);

// Invite + accept
const tok = (await as(U.owner, `insert into invitations (organisation_id,email) values ('${org}','staff@a.com') returning token`)).rows[0].token;
await as(U.owner, `insert into invitations (organisation_id,email) values ('${org}','staff2@a.com')`);
await throws("wrong email cannot accept", () => as(U.other, `select public.accept_invitation('${tok}')`));
await as(U.staff, `select public.accept_invitation('${tok}')`);
const tok2 = (await as(U.owner, `select token from invitations where email='staff2@a.com'`)).rows[0].token;
await as(U.staff2, `select public.accept_invitation('${tok2}')`);
expect("staff joined", (await as(U.staff, `select role from org_members where user_id='${U.staff}'`)).rows[0]?.role === "staff");
expect("invitation preview works for anon",
  (await (async()=>{ await db.exec("reset role; set role anon"); return db.query(`select * from public.invitation_preview('${tok}')`); })()).rows.length === 0);

// Tenant isolation
expect("other org cannot see Shepherd org", (await as(U.other, `select count(*)::int n from organisations where id='${org}'`)).rows[0].n === 0);
await throws("staff cannot create participant", () => as(U.staff, `insert into participants (organisation_id,first_name,last_name) values ('${org}','X','Y')`));

const p1 = (await as(U.owner, `insert into participants (organisation_id,first_name,last_name,ndis_number) values ('${org}','Jane','Citizen','430000001') returning id`)).rows[0].id;
const p2 = (await as(U.owner, `insert into participants (organisation_id,first_name,last_name) values ('${org}','John','Smith') returning id`)).rows[0].id;
expect("other org cannot see participants", (await as(U.other, `select count(*)::int n from participants`)).rows[0].n === 0);
expect("staff sees no participants before rostering", (await as(U.staff, `select count(*)::int n from participants`)).rows[0].n === 0);

const s1 = (await as(U.owner, `insert into shifts (organisation_id,participant_id,staff_user_id,starts_at,ends_at,status)
  values ('${org}','${p1}','${U.staff}', now() - interval '1 hour', now() + interval '3 hours','published') returning id`)).rows[0].id;
await as(U.owner, `insert into shifts (organisation_id,participant_id,staff_user_id,starts_at,ends_at,status)
  values ('${org}','${p2}','${U.staff}', now() + interval '1 day', now() + interval '1 day 4 hours','draft')`);
expect("staff sees only rostered participant", (await as(U.staff, `select count(*)::int n from participants`)).rows[0].n === 1);
expect("staff sees published shift only", (await as(U.staff, `select count(*)::int n from shifts`)).rows[0].n === 1);
expect("staff2 sees no shifts", (await as(U.staff2, `select count(*)::int n from shifts`)).rows[0].n === 0);
await throws("staff cannot edit shift directly", async () => {
  const r = await as(U.staff, `update shifts set ends_at = ends_at + interval '5 hours' where id='${s1}' returning id`);
  if (r.rows.length === 0) throw new Error("no rows");
});

// Clock in/out
await as(U.staff, `select public.clock_in('${s1}', -33.8, 151.2)`);
await throws("staff2 cannot clock out someone else", () => as(U.staff2, `select public.clock_out('${s1}')`));
await as(U.staff, `select public.clock_out('${s1}')`);
expect("shift completed", (await as(U.owner, `select status from shifts where id='${s1}'`)).rows[0].status === "completed");

// Notes, incidents, claims
await as(U.staff, `insert into progress_notes (organisation_id,participant_id,shift_id,author_id,body) values ('${org}','${p1}','${s1}','${U.staff}','Went shopping, good mood.')`);
await throws("staff2 cannot write note for unrostered participant",
  () => as(U.staff2, `insert into progress_notes (organisation_id,participant_id,author_id,body) values ('${org}','${p1}','${U.staff2}','x')`));
await as(U.staff, `insert into incident_reports (organisation_id,participant_id,shift_id,reported_by,occurred_at,category,description) values ('${org}','${p1}','${s1}','${U.staff}',now(),'fall','Minor fall, no injury')`);
expect("staff2 cannot read staff's incident", (await as(U.staff2, `select count(*)::int n from incident_reports`)).rows[0].n === 0);
const adj = (await as(U.staff, `insert into timesheet_adjustments (organisation_id,shift_id,staff_user_id,extra_minutes,reason) values ('${org}','${s1}','${U.staff}',45,'Participant unwell, stayed late') returning id`)).rows[0].id;
await throws("staff cannot self-approve", () => as(U.staff, `select public.review_claim('timesheet_adjustments','${adj}','approved')`));
await as(U.owner, `select public.review_claim('timesheet_adjustments','${adj}','approved','OK')`);
expect("adjustment approved", (await as(U.staff, `select status from timesheet_adjustments where id='${adj}'`)).rows[0].status === "approved");
await as(U.staff, `insert into travel_logs (organisation_id,shift_id,participant_id,staff_user_id,travelled_on,kilometres) values ('${org}','${s1}','${p1}','${U.staff}',current_date,23.5)`);
await throws("staff cannot insert pre-approved claim",
  () => as(U.staff, `insert into expense_claims (organisation_id,staff_user_id,incurred_on,category,amount,status) values ('${org}','${U.staff}',current_date,'meals',12,'approved')`));

// Audit + holidays
expect("audit log captured changes", (await as(U.owner, `select count(*)::int n from audit_log where organisation_id='${org}'`)).rows[0].n > 5);
expect("staff cannot read audit log", (await as(U.staff, `select count(*)::int n from audit_log`)).rows[0].n === 0);
expect("NSW holidays seeded", (await as(U.staff, `select count(*)::int n from public_holidays where state='NSW'`)).rows[0].n === 25);

// Budget usage
const plan = (await as(U.owner, `insert into ndis_plans (organisation_id,participant_id,start_date,end_date,management_type)
  values ('${org}','${p1}','2026-07-01','2027-06-30','plan_managed') returning id`)).rows[0].id;
const budget = (await as(U.owner, `insert into plan_budgets (organisation_id,plan_id,category,allocated_amount)
  values ('${org}','${plan}','assistance_daily_life',10000) returning id`)).rows[0].id;
// s1 is completed: 4h rostered + 45 min approved extra at $70/h = $332.50
await as(U.owner, `update shifts set plan_budget_id='${budget}', charge_rate=70 where id='${s1}'`);
await as(U.owner, `insert into shifts (organisation_id,participant_id,staff_user_id,starts_at,ends_at,status,plan_budget_id,charge_rate)
  values ('${org}','${p1}','${U.staff}', now() + interval '2 days', now() + interval '2 days 2 hours','published','${budget}',70)`);
const usage = (await as(U.owner, `select spent::float, committed::float from plan_budget_usage where plan_budget_id='${budget}'`)).rows[0];
expect("budget spent includes approved extra hours", usage?.spent === 332.5);
expect("budget committed counts upcoming shifts", usage?.committed === 140);
expect("staff cannot see budgets", (await as(U.staff, `select count(*)::int n from plan_budget_usage`)).rows[0].n === 0);
expect("staff can see rostered participant's plan", (await as(U.staff, `select count(*)::int n from ndis_plans`)).rows[0].n === 1);
expect("other org sees no plans", (await as(U.other, `select count(*)::int n from ndis_plans`)).rows[0].n === 0);

// Double booking
await throws("cannot double-book a worker", () => as(U.owner, `insert into shifts (organisation_id,staff_user_id,starts_at,ends_at,status)
  values ('${org}','${U.staff}', now() + interval '2 days 1 hour', now() + interval '2 days 5 hours','draft')`));
await as(U.owner, `insert into shifts (organisation_id,staff_user_id,starts_at,ends_at,status)
  values ('${org}','${U.staff}', now() + interval '2 days 2 hours', now() + interval '2 days 3 hours','cancelled')`);
expect("cancelled shifts don't block", true);
await as(U.owner, `insert into shifts (organisation_id,staff_user_id,starts_at,ends_at,status)
  values ('${org}','${U.staff}', now() + interval '2 days 2 hours', now() + interval '2 days 4 hours','draft')`).then(
  () => expect("back-to-back shift allowed", true), () => expect("back-to-back shift allowed", false));

// Staff flow
await throws("staff cannot attach a note to someone else's shift", async () => {
  const other = (await as(U.owner, `insert into shifts (organisation_id,participant_id,staff_user_id,starts_at,ends_at,status)
    values ('${org}','${p1}','${U.staff2}', now() + interval '5 days', now() + interval '5 days 2 hours','published') returning id`)).rows[0].id;
  await as(U.staff, `insert into progress_notes (organisation_id,participant_id,shift_id,author_id,body) values ('${org}','${p1}','${other}','${U.staff}','x')`);
});
await throws("only one pending extra-hours request per shift",
  () => as(U.staff, `insert into timesheet_adjustments (organisation_id,shift_id,staff_user_id,extra_minutes,reason) values ('${org}','${s1}','${U.staff}',15,'a'),('${org}','${s1}','${U.staff}',15,'b')`));
await as(U.staff, `insert into push_subscriptions (user_id,endpoint,p256dh,auth) values ('${U.staff}','https://push.example/1','k','a')`);
expect("push subscriptions are private", (await as(U.owner, `select count(*)::int n from push_subscriptions`)).rows[0].n === 0);
await throws("admin cannot exempt own org from billing",
  () => as(U.owner, `update organisations set billing_exempt = true where id='${org}'`));

// Custom domains
await throws("admin cannot set domain status directly",
  () => as(U.owner, `update organisations set custom_domain='portal.example.com', domain_status='active' where id='${org}'`));
await as(U.owner, `update organisations set brand_primary='#123456' where id='${org}'`);
expect("admin can still edit branding", (await as(U.owner, `select brand_primary from organisations where id='${org}'`)).rows[0].brand_primary === "#123456");
await db.exec(`reset role; update organisations set custom_domain='portal.example.com', domain_status='active' where id='${org}'`);
await db.exec("set role anon");
expect("anon resolves org by host", (await db.query(`select name from public.org_by_host('Portal.Example.com')`)).rows[0]?.name === "Shepherd Care");
expect("unknown host resolves nothing", (await db.query(`select * from public.org_by_host('evil.example.com')`)).rows.length === 0);

// App branding
await as(U.owner, `update organisations set app_name='Shepherd', app_icon_path='x/app-icon.png' where id='${org}'`);
await db.exec("reset role; set role anon");
expect("anon reads app manifest details", (await db.query(`select app_name from public.org_app_manifest('${org}')`)).rows[0]?.app_name === "Shepherd");
expect("org_by_host returns app name", (await db.query(`select app_name from public.org_by_host('portal.example.com')`)).rows[0]?.app_name === "Shepherd");
await throws("staff cannot change app name", async () => {
  const r = await as(U.staff, `update organisations set app_name='Hacked' where id='${org}' returning id`);
  if (!r.rows.length) throw new Error("no rows");
});

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
