# Care Platform (Shepherd Care)

A multi-tenant, white-label platform for NDIS providers: participants, plans and
budgets, rostering, progress and incident notes, expenses and travel, timesheets,
approvals and SCHADS-aligned payroll exports. Shepherd Care is the first tenant;
other providers can sign up with their own logo and colours.

**Stack:** Next.js 15 (App Router) on Cloudflare Workers via OpenNext ·
Supabase (Postgres + row-level security, auth, storage) in the Sydney region ·
installable PWA for iPhone and Android.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1. Foundation | Organisations + branding, email-code sign-in, invitations, roles, app shell, PWA, full database schema with security policies, audit log, NSW public holidays | ✅ Done |
| 2. Participants | Participant records, NDIS plans, budgets by support category | ⏳ Next |
| 3. Rostering | Calendar, shifts, appointments, open shifts | |
| 4. Staff mobile flow | My shifts, clock in/out, progress & incident notes, expenses, km, night-before reminders | |
| 5. Timesheets & payroll | Extra-hours approvals, SCHADS export (weekday / evening / night / Sat / Sun / public holiday / km) | |
| 6. SaaS | Self-serve signup polish, subscription billing, custom domains | |

## Local setup

Requirements: Node 20+, Docker (for local Supabase).

```bash
npm install
cp .env.example .env.local      # fill in after `db:start`
npm run db:start                # starts local Supabase, applies migrations
npm run dev                     # http://localhost:3000
```

`npm run db:start` prints the local API URL and anon/service keys — put them in
`.env.local`. Sign-in emails appear in the local inbox at http://localhost:54324.

First run: go to `/signup`, enter your email, enter the code, create your
organisation. You become its owner; invite staff from **Staff**.

## Production setup

1. **Supabase** — create a project in **Sydney (ap-southeast-2)** on the Pro plan.
   - `npx supabase link --project-ref <ref>` then `npm run db:push`.
   - Authentication → Email Templates: paste `supabase/templates/otp.html` into
     **Magic Link** and **Confirm signup** (sign-in uses 6-digit codes, not links,
     so it works inside the iPhone home-screen app).
   - Authentication → URL Configuration: set Site URL to your domain.
   - Authentication → SMTP: connect Resend (or any SMTP) — the built-in sender is
     rate-limited and not for production.
2. **Cloudflare** — `npx wrangler login`, then set secrets:
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put RESEND_API_KEY
   ```
   Public variables (`NEXT_PUBLIC_*`, `EMAIL_FROM`) go in `.env.production`
   at build time. Deploy with `npm run deploy`.
3. Point your domain (e.g. `app.shepherdcare.com.au`) at the Worker.

## Security model

- Every business table has `organisation_id`; row-level security makes other
  organisations' data invisible at the database level.
- Roles: **owner / admin** (everything incl. settings and staff), **coordinator**
  (participants, rostering, approvals), **staff** (own shifts and records).
- Staff only see participants they have a published shift with (from 14 days ago
  onwards) — need-to-know access.
- Clock-in/out and approvals go through validated database functions; staff
  cannot edit their own shifts or approve their own claims.
- Every change to participant, shift, note, incident and claim records is written
  to `audit_log`.
- Participant data is never cached on devices by the service worker.

Run the database security tests with `npm run test:db`.

## Project layout

```
src/app/(app)/        signed-in area (dashboard, admin/*)
src/app/login|signup|invite/   public auth pages
src/lib/org.ts        current user, membership and role helpers
src/lib/brand.ts      per-organisation theming
supabase/migrations/  database schema, policies, seed holidays
supabase/tests/       database security tests
```
