-- CSV imports of participants and staff.

-- Participants: how funding is managed when no plan has been entered, and the ID from the system they came from
alter table public.participants
  add column management_type public.plan_management,
  add column external_ref text;
create unique index participants_external_ref_unique on public.participants (organisation_id, external_ref) where external_ref is not null;

-- Staff imported from a file become invitations that haven't been sent yet.
-- Their details are copied to the profile/membership when they accept.
alter table public.invitations
  add column full_name       text,
  add column phone           text,
  add column employment_type public.employment_type,
  add column external_ref    text,
  add column sent_at         timestamptz default now();   -- null = imported, not invited yet

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select * into v_inv from public.invitations
  where token = p_token and accepted_at is null and sent_at is not null and expires_at > now()
  for update;
  if not found then raise exception 'Invitation is invalid or has expired'; end if;
  if v_inv.email <> v_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.org_members (organisation_id, user_id, role, employment_type)
  values (v_inv.organisation_id, auth.uid(), v_inv.role, v_inv.employment_type)
  on conflict (organisation_id, user_id) do update
    set status = 'active', employment_type = coalesce(public.org_members.employment_type, excluded.employment_type);

  -- Fill in the profile from the imported details, without overwriting what they entered themselves
  update public.profiles set
    full_name = case when coalesce(full_name, '') = '' then coalesce(v_inv.full_name, '') else full_name end,
    phone = coalesce(phone, v_inv.phone)
  where id = auth.uid();

  update public.invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.organisation_id;
end $$;

-- Imported-but-not-sent invitations can't be previewed
create or replace function public.invitation_preview(p_token text)
returns table (organisation_name text, email text, role public.org_role, logo_path text, brand_primary text)
language sql stable security definer set search_path = public as $$
  select o.name, i.email, i.role, o.logo_path, o.brand_primary
  from public.invitations i join public.organisations o on o.id = i.organisation_id
  where i.token = p_token and i.accepted_at is null and i.sent_at is not null and i.expires_at > now();
$$;
