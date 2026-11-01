-- =============================================================================
-- SaaS billing (Stripe). Server-managed columns: not in the authenticated
-- UPDATE column grant, so only the server (service role) can change them.
-- =============================================================================
alter table public.organisations
  add column trial_ends_at          timestamptz not null default now() + interval '30 days',
  add column billing_exempt         boolean not null default false,  -- e.g. the platform owner's own organisation
  add column stripe_customer_id     text unique,
  add column stripe_subscription_id text unique,
  add column current_period_end     timestamptz;
