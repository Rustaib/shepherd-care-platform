-- =============================================================================
-- Per-organisation installed-app branding: the name shown under the home-screen
-- icon and the icon itself (a square PNG generated from the logo in the
-- browser). New organisations default to the Hoiva palette.
-- =============================================================================
alter table public.organisations
  add column app_name text check (app_name is null or length(app_name) between 1 and 30),
  add column app_icon_path text;

alter table public.organisations
  alter column brand_primary   set default '#11606B',
  alter column brand_secondary set default '#8FC1B5',
  alter column brand_accent    set default '#FF8A78';

grant update (app_name, app_icon_path) on public.organisations to authenticated;

-- Host lookup now also returns the app branding (return type changes → drop first)
drop function if exists public.org_by_host(text);
create function public.org_by_host(p_host text)
returns table (id uuid, name text, logo_path text, brand_primary text, brand_secondary text, brand_accent text,
               app_name text, app_icon_path text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.logo_path, o.brand_primary, o.brand_secondary, o.brand_accent, o.app_name, o.app_icon_path
  from public.organisations o
  where o.custom_domain = lower(p_host) and o.domain_status = 'active';
$$;
revoke all on function public.org_by_host(text) from public;
grant execute on function public.org_by_host(text) to anon, authenticated;

-- Public app-install details for one organisation (used by the web app
-- manifest, which browsers fetch without cookies). Returns branding only.
create function public.org_app_manifest(p_org uuid)
returns table (name text, app_name text, brand_primary text, app_icon_path text)
language sql stable security definer set search_path = public as $$
  select o.name, o.app_name, o.brand_primary, o.app_icon_path from public.organisations o where o.id = p_org;
$$;
revoke all on function public.org_app_manifest(uuid) from public;
grant execute on function public.org_app_manifest(uuid) to anon, authenticated;
