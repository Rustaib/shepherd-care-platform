# Care Platform (Shepherd Care)

A multi-tenant, white-label platform for NDIS providers: participants, plans and
budgets, rostering, progress and incident notes, expenses and travel, timesheets,
approvals and SCHADS-aligned payroll exports. Shepherd Care is the first tenant;
other providers can sign up with their own logo and colours.

**Stack:** Next.js 15 (App Router) on Cloudflare Workers via OpenNext ·
Supabase (Postgres + row-level security, auth, storage) in the Sydney region ·
installable PWA for iPhone and Android.

## Features

| Area | What's included |
|---|---|
| Foundation | Organisations with logo + colours, email-code sign-in, staff invitations, roles (owner / admin / coordinator / support worker), installable app, audit log |
| Participants | Profiles, support notes, emergency contacts, NDIS plans and goals, budgets by support category with used / booked / remaining, progress notes history |
| Rostering | Weekly roster, open / overnight / repeating shifts, double-booking protection, publish and copy week, appointments |
| Support workers | My shifts, clock in/out (optional location), progress notes (editable 24 h) against plan goals, incident reports, expenses with receipt photos, kilometres, extra-hours requests, My claims |
| Reminders | Email + push notification the evening before each shift (default 6pm local), listing appointments during the shift |
| Incidents | NDIS Commission reportable categories with 24-hour / 5-business-day deadlines, manager alerts, review workflow, incident register |
| Approvals & payroll | Approve/reject extra hours, expenses and km; payroll export (screen + CSV) split into weekday / weekday evening / weekday night / Saturday / Sunday / public holiday hours, plus km and expenses; public holiday calendar per state |
| SaaS | Custom domains per organisation, self-serve signup, 30-day trial, Stripe subscription billing, setup checklist |

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

## Production setup (go-live checklist)

A detailed step-by-step version of this checklist is kept in the project's Go-Live Guide.


1. **Supabase** — create a project in **Sydney (ap-southeast-2)** on the Pro plan.
   - `npx supabase link --project-ref <ref>` then `npm run db:push` (applies all migrations,
     including NSW public holidays for 2026–27).
   - Authentication → Email Templates: paste `supabase/templates/otp.html` into
     **Magic Link** and **Confirm signup** (sign-in uses 6-digit codes, not links,
     so it works inside the iPhone home-screen app).
   - Authentication → URL Configuration: set Site URL to the platform domain.
   - Authentication → SMTP: connect Resend (or any SMTP) — the built-in sender is
     rate-limited and not for production.
2. **Email** — create a Resend account, verify your sending domain, set `RESEND_API_KEY` and `EMAIL_FROM`.
3. **Push notifications** — `npx @pushforge/builder vapid`; set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   (build-time) and `VAPID_PRIVATE_JWK` (secret). Pick any long random `CRON_SECRET`.
4. **Cloudflare** — `npx wrangler login`, set `APP_URL` in `wrangler.jsonc`, then secrets:
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put VAPID_PRIVATE_JWK
   npx wrangler secret put CRON_SECRET
   # optional: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CLOUDFLARE_API_TOKEN
   ```
   Browser-visible `NEXT_PUBLIC_*` values go in `.env.production` (read at build time);
   other non-secret settings (`EMAIL_FROM`, `STRIPE_PRICE_ID`, …) go in `vars` in `wrangler.jsonc`. Deploy with `npm run deploy`. The Worker's hourly
   cron (`worker.ts`) sends reminders at each organisation's local reminder hour.
5. Point the platform domain (e.g. `app.careplatform.com.au`) at the Worker.
6. **Billing (optional, for selling to other providers)** — in Stripe create a product
   with a recurring price (`STRIPE_PRICE_ID`), add a webhook to
   `https://<platform>/api/stripe/webhook` for `checkout.session.completed` and
   `customer.subscription.*` (`STRIPE_WEBHOOK_SECRET`), and enable the customer portal.
   Without Stripe keys, billing is off and nobody is limited.
7. **Your own organisation** — sign up at `/signup`, then exempt it from billing in
   the Supabase SQL editor: `update organisations set billing_exempt = true where slug like 'shepherd%';`
8. Connect `portal.shepherdcare.com.au` in Settings → Custom domain and add the
   Squarespace redirect for `/portal`.

## Customer domains (white-label)

Each organisation can connect one hostname, e.g. `portal.shepherdcare.com.au`,
from **Settings → Custom domain**. Their login page, installed app name and
colours, and invitation links then use their own domain.

How it works: Cloudflare for SaaS issues and renews SSL for each customer
hostname (100 included free, then US$0.10/month each). The customer adds one
CNAME record pointing at `CUSTOM_DOMAIN_CNAME_TARGET`.

One-time platform setup in the Cloudflare dashboard (zone of the platform domain):
1. SSL/TLS → Custom Hostnames → enable Cloudflare for SaaS.
2. Create a proxied DNS record for the CNAME target, e.g.
   `customers.careplatform.com.au`, and set it as the **fallback origin**.
3. Workers Routes → add route `*/*` for the Worker so customer hostnames reach it.
4. Create an API token with *SSL and Certificates: Edit* on the zone and set
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CUSTOM_DOMAIN_CNAME_TARGET`.

A path on a customer's main website (e.g. `shepherdcare.com.au/portal`) is
handled with a redirect from their website builder — in Squarespace:
Settings → Developer Tools → URL Mappings → `/portal -> https://portal.shepherdcare.com.au 301`.
Serving the portal *under* a path would require the customer's whole domain to
be proxied through Cloudflare, so it isn't the default.

Sign-in uses email codes rather than links, so customer domains don't need to be
registered as redirect URLs in Supabase.

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

Run the database security tests with `npm run test:db`, and the time-zone, payroll and webhook tests with `npm run test:unit`.

## Project layout

```
src/app/(app)/        signed-in area: dashboard, roster, participants, shifts,
                      claims, incidents, approvals, admin/* (staff, exports,
                      holidays, billing, settings)
src/app/api/          cron reminders, payroll CSV, Stripe webhook
src/app/login|signup|invite/   public auth pages
src/lib/org.ts        current user, membership and role helpers
src/lib/brand.ts      per-organisation theming
src/lib/payroll.ts    SCHADS-aligned hour classification (unit tested)
src/lib/time.ts       time-zone safe roster dates (unit tested)
src/lib/reminders.ts  night-before shift reminders
worker.ts             Cloudflare Worker entry (app + hourly cron)
supabase/migrations/  database schema, policies, seed holidays
supabase/tests/       database security tests
```
