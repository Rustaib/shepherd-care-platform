-- =============================================================================
-- Custom domains (white-label SaaS)
-- Each organisation can connect one hostname, e.g. portal.shepherdcare.com.au.
-- Domain fields are written only by the server (service role) after calling
-- the Cloudflare for SaaS API, so an admin can't claim a domain they don't own.
-- =============================================================================

alter table public.organisations
  add column custom_domain text unique
    check (custom_domain is null or custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$'),
  add column domain_status text not null default 'none'
    check (domain_status in ('none','pending','active','error')),
  add column domain_provider_id text,       -- Cloudflare custom hostname id
  add column domain_checked_at timestamptz;

-- Column-level privileges: signed-in admins may edit profile/branding/settings
-- columns only. Domain and subscription columns are server-managed.
revoke update on public.organisations from authenticated, anon;
grant update (
  name, abn, ndis_registration_number, state, timezone, logo_path,
  brand_primary, brand_secondary, brand_accent,
  reminder_hour_local, progress_note_lock_hours
) on public.organisations to authenticated;

-- Resolve the organisation that owns a hostname (used before sign-in to brand
-- the login page). Returns only public branding fields.
create or replace function public.org_by_host(p_host text)
returns table (id uuid, name text, logo_path text, brand_primary text, brand_secondary text, brand_accent text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.logo_path, o.brand_primary, o.brand_secondary, o.brand_accent
  from public.organisations o
  where o.custom_domain = lower(p_host) and o.domain_status = 'active';
$$;

revoke all on function public.org_by_host(text) from public;
grant execute on function public.org_by_host(text) to anon, authenticated;
