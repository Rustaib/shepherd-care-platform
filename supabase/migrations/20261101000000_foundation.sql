-- =============================================================================
-- Shepherd Care Platform — foundation schema
-- Multi-tenant: every business table carries organisation_id and is protected
-- by row-level security. Users can belong to more than one organisation.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.au_state as enum ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT');
create type public.org_role as enum ('owner','admin','coordinator','staff');
create type public.member_status as enum ('active','suspended');
create type public.employment_type as enum ('full_time','part_time','casual','contractor');
create type public.participant_status as enum ('active','inactive','archived');
create type public.plan_management as enum ('ndia_managed','plan_managed','self_managed');
create type public.plan_status as enum ('draft','active','expired');
create type public.support_category as enum (
  'assistance_daily_life','transport','consumables','assistance_social_community',
  'assistive_technology','home_modifications','support_coordination',
  'improved_living_arrangements','increased_social_community_participation',
  'finding_keeping_job','improved_relationships','improved_health_wellbeing',
  'improved_learning','improved_life_choices','improved_daily_living'
);
create type public.shift_status as enum ('draft','published','in_progress','completed','cancelled');
create type public.claim_status as enum ('pending','approved','rejected');
create type public.incident_status as enum ('open','under_review','reported_to_commission','closed');
create type public.incident_severity as enum ('low','medium','high','critical');

-- -----------------------------------------------------------------------------
-- Generic updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Organisations (tenants) and branding
-- -----------------------------------------------------------------------------
create table public.organisations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 2 and 120),
  slug             text not null unique check (slug ~ '^[a-z0-9](-?[a-z0-9])*$'),
  abn              text,
  ndis_registration_number text,
  state            public.au_state not null default 'NSW',
  timezone         text not null default 'Australia/Sydney',
  -- Branding (white-label)
  logo_path        text,                      -- storage path in org-assets bucket
  brand_primary    text not null default '#1f4e79' check (brand_primary ~* '^#[0-9a-f]{6}$'),
  brand_secondary  text not null default '#2e8b57' check (brand_secondary ~* '^#[0-9a-f]{6}$'),
  brand_accent     text not null default '#f2a541' check (brand_accent ~* '^#[0-9a-f]{6}$'),
  -- SaaS
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','cancelled')),
  -- Settings
  reminder_hour_local smallint not null default 18 check (reminder_hour_local between 0 and 23),
  progress_note_lock_hours smallint not null default 24,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_organisations_updated before update on public.organisations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Profiles (one per auth user, shared across organisations)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  phone       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Membership: links a user to an organisation with a role
-- -----------------------------------------------------------------------------
create table public.org_members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            public.org_role not null default 'staff',
  status          public.member_status not null default 'active',
  employment_type public.employment_type,
  schads_level    text,           -- e.g. '2.1'; used later for payroll
  start_date      date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, user_id)
);
create index on public.org_members (user_id);
create trigger trg_org_members_updated before update on public.org_members
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS helper functions (security definer so they can read org_members
-- without recursing through its own policies)
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where organisation_id = p_org and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where organisation_id = p_org and user_id = auth.uid()
      and status = 'active' and role = any (p_roles)
  );
$$;

-- Admin-level = owner, admin or coordinator (can manage rosters & participants)
create or replace function public.is_org_manager(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_org_role(p_org, array['owner','admin','coordinator']::public.org_role[]);
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_org_role(p_org, array['owner','admin']::public.org_role[]);
$$;

-- -----------------------------------------------------------------------------
-- Invitations (admin invites staff by email)
-- -----------------------------------------------------------------------------
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email           text not null check (email = lower(email)),
  role            public.org_role not null default 'staff',
  token           text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by      uuid references auth.users(id) on delete set null,
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index invitations_open_unique
  on public.invitations (organisation_id, email) where accepted_at is null;

-- -----------------------------------------------------------------------------
-- Participants, plans, budgets
-- -----------------------------------------------------------------------------
create table public.participants (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  preferred_name  text,
  ndis_number     text check (ndis_number is null or ndis_number ~ '^[0-9]{9}$'),
  date_of_birth   date,
  phone           text,
  email           text,
  address_line1   text,
  address_line2   text,
  suburb          text,
  state           public.au_state,
  postcode        text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  support_notes   text,     -- key info staff need (communication, routines, risks)
  status          public.participant_status not null default 'active',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, ndis_number)
);
create index on public.participants (organisation_id, status);
create trigger trg_participants_updated before update on public.participants
  for each row execute function public.set_updated_at();

create table public.ndis_plans (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id  uuid not null references public.participants(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  management_type public.plan_management not null,
  plan_manager_name  text,
  plan_manager_email text,
  goals           text,
  status          public.plan_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date > start_date)
);
create index on public.ndis_plans (participant_id);
create trigger trg_ndis_plans_updated before update on public.ndis_plans
  for each row execute function public.set_updated_at();

create table public.plan_budgets (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  plan_id         uuid not null references public.ndis_plans(id) on delete cascade,
  category        public.support_category not null,
  allocated_amount numeric(12,2) not null check (allocated_amount >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (plan_id, category)
);
create trigger trg_plan_budgets_updated before update on public.plan_budgets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Rostering: shifts and appointments
-- -----------------------------------------------------------------------------
create table public.shifts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id  uuid references public.participants(id) on delete set null,
  staff_user_id   uuid references public.profiles(id) on delete set null,   -- null = unfilled
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  break_minutes   smallint not null default 0 check (break_minutes >= 0),
  status          public.shift_status not null default 'draft',
  location        text,
  instructions    text,
  plan_budget_id  uuid references public.plan_budgets(id) on delete set null,
  support_item_code text,                -- NDIS price guide line item
  charge_rate     numeric(10,2),         -- $/hour billed to the plan
  clock_in_at     timestamptz,
  clock_out_at    timestamptz,
  clock_in_lat    double precision,
  clock_in_lng    double precision,
  reminder_sent_at timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '24 hours')
);
create index on public.shifts (organisation_id, starts_at);
create index on public.shifts (staff_user_id, starts_at);
create index on public.shifts (participant_id, starts_at);
create trigger trg_shifts_updated before update on public.shifts
  for each row execute function public.set_updated_at();

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id  uuid not null references public.participants(id) on delete cascade,
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  location        text,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index on public.appointments (participant_id, starts_at);
create index on public.appointments (organisation_id, starts_at);
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();

-- Can the current user see this participant?
-- Managers: all participants in the org. Staff: participants they have a
-- shift with from 14 days ago onwards (privacy: need-to-know access).
create or replace function public.can_view_participant(p_participant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants p
    where p.id = p_participant
      and (
        public.is_org_manager(p.organisation_id)
        or (
          public.is_org_member(p.organisation_id)
          and exists (
            select 1 from public.shifts s
            where s.participant_id = p.id
              and s.staff_user_id = auth.uid()
              and s.status not in ('cancelled','draft')
              and s.ends_at >= now() - interval '14 days'
          )
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Shift records: progress notes, incidents, expenses, travel, extra hours
-- -----------------------------------------------------------------------------
create table public.progress_notes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id  uuid not null references public.participants(id) on delete cascade,
  shift_id        uuid references public.shifts(id) on delete set null,
  author_id       uuid not null references auth.users(id),
  body            text not null check (length(body) > 0),
  goals_addressed text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.progress_notes (participant_id, created_at desc);
create trigger trg_progress_notes_updated before update on public.progress_notes
  for each row execute function public.set_updated_at();

create table public.incident_reports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id  uuid references public.participants(id) on delete set null,
  shift_id        uuid references public.shifts(id) on delete set null,
  reported_by     uuid not null references auth.users(id),
  occurred_at     timestamptz not null,
  location        text,
  category        text not null,
  severity        public.incident_severity not null default 'low',
  description     text not null,
  immediate_action text,
  witnesses       text,
  is_reportable   boolean not null default false,   -- reportable to NDIS Commission
  status          public.incident_status not null default 'open',
  commission_notified_at timestamptz,
  reviewed_by     uuid references auth.users(id),
  review_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.incident_reports (organisation_id, status, created_at desc);
create trigger trg_incident_reports_updated before update on public.incident_reports
  for each row execute function public.set_updated_at();

create table public.expense_claims (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  shift_id        uuid references public.shifts(id) on delete set null,
  participant_id  uuid references public.participants(id) on delete set null,
  staff_user_id   uuid not null references auth.users(id),
  incurred_on     date not null,
  category        text not null,
  amount          numeric(10,2) not null check (amount > 0),
  description     text,
  receipt_path    text,          -- storage path in receipts bucket
  status          public.claim_status not null default 'pending',
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.expense_claims (organisation_id, status);
create trigger trg_expense_claims_updated before update on public.expense_claims
  for each row execute function public.set_updated_at();

create table public.travel_logs (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  shift_id        uuid references public.shifts(id) on delete set null,
  participant_id  uuid references public.participants(id) on delete set null,
  staff_user_id   uuid not null references auth.users(id),
  travelled_on    date not null,
  kilometres      numeric(7,1) not null check (kilometres > 0 and kilometres < 2000),
  from_location   text,
  to_location     text,
  purpose         text,
  status          public.claim_status not null default 'pending',
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.travel_logs (organisation_id, travelled_on);
create trigger trg_travel_logs_updated before update on public.travel_logs
  for each row execute function public.set_updated_at();

-- Extra hours worked beyond the rostered shift — needs admin approval
create table public.timesheet_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  shift_id        uuid not null references public.shifts(id) on delete cascade,
  staff_user_id   uuid not null references auth.users(id),
  extra_minutes   integer not null check (extra_minutes > 0 and extra_minutes <= 720),
  reason          text not null,
  status          public.claim_status not null default 'pending',
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.timesheet_adjustments (organisation_id, status);
create trigger trg_timesheet_adjustments_updated before update on public.timesheet_adjustments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Public holidays (state-based; org-specific rows override/add)
-- -----------------------------------------------------------------------------
create table public.public_holidays (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade, -- null = national/state list
  state           public.au_state not null,
  holiday_date    date not null,
  name            text not null,
  unique nulls not distinct (organisation_id, state, holiday_date)
);

-- -----------------------------------------------------------------------------
-- Audit log (who changed what, when) — written by triggers only
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id              bigint generated always as identity primary key,
  organisation_id uuid,
  actor_id        uuid,
  action          text not null,          -- INSERT / UPDATE / DELETE
  table_name      text not null,
  record_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  created_at      timestamptz not null default now()
);
create index on public.audit_log (organisation_id, created_at desc);

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (organisation_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    (v_row->>'organisation_id')::uuid,
    auth.uid(),
    tg_op,
    tg_table_name,
    (v_row->>'id')::uuid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'participants','ndis_plans','plan_budgets','shifts','appointments',
    'progress_notes','incident_reports','expense_claims','travel_logs',
    'timesheet_adjustments','org_members','invitations'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
       for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- =============================================================================
-- Row-level security
-- =============================================================================
alter table public.organisations         enable row level security;
alter table public.profiles              enable row level security;
alter table public.org_members           enable row level security;
alter table public.invitations           enable row level security;
alter table public.participants          enable row level security;
alter table public.ndis_plans            enable row level security;
alter table public.plan_budgets          enable row level security;
alter table public.shifts                enable row level security;
alter table public.appointments          enable row level security;
alter table public.progress_notes        enable row level security;
alter table public.incident_reports      enable row level security;
alter table public.expense_claims        enable row level security;
alter table public.travel_logs           enable row level security;
alter table public.timesheet_adjustments enable row level security;
alter table public.public_holidays       enable row level security;
alter table public.audit_log             enable row level security;

-- Organisations
create policy org_select on public.organisations for select
  using (public.is_org_member(id));
create policy org_update on public.organisations for update
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
-- (creation goes through create_organisation(); no insert policy)

-- Profiles: yourself, or anyone sharing an organisation with you
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.org_members mine
    join public.org_members theirs on theirs.organisation_id = mine.organisation_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Members
create policy members_select on public.org_members for select
  using (public.is_org_member(organisation_id));
create policy members_admin_write on public.org_members for all
  using (public.is_org_admin(organisation_id)) with check (public.is_org_admin(organisation_id));

-- Invitations
create policy invitations_admin on public.invitations for all
  using (public.is_org_admin(organisation_id)) with check (public.is_org_admin(organisation_id));

-- Participants / plans / budgets / appointments
create policy participants_select on public.participants for select
  using (public.can_view_participant(id));
create policy participants_manage on public.participants for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

create policy plans_select on public.ndis_plans for select
  using (public.can_view_participant(participant_id));
create policy plans_manage on public.ndis_plans for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

create policy budgets_manage on public.plan_budgets for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

create policy appointments_select on public.appointments for select
  using (public.can_view_participant(participant_id));
create policy appointments_manage on public.appointments for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Shifts: managers do everything; staff read their own (clock in/out via RPC)
create policy shifts_select on public.shifts for select using (
  public.is_org_manager(organisation_id)
  or (staff_user_id = auth.uid() and status <> 'draft' and public.is_org_member(organisation_id))
);
create policy shifts_manage on public.shifts for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Progress notes: staff write their own against participants they support;
-- anyone who can view the participant can read notes (continuity of care).
create policy notes_select on public.progress_notes for select
  using (public.can_view_participant(participant_id));
create policy notes_insert on public.progress_notes for insert with check (
  author_id = auth.uid()
  and public.is_org_member(organisation_id)
  and public.can_view_participant(participant_id)
);
create policy notes_update_own on public.progress_notes for update using (
  author_id = auth.uid()
  and created_at > now() - make_interval(hours => (
    select progress_note_lock_hours from public.organisations o where o.id = organisation_id))
) with check (author_id = auth.uid());
create policy notes_manage on public.progress_notes for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Incidents: staff file and read their own; managers see and review all
create policy incidents_select on public.incident_reports for select
  using (reported_by = auth.uid() or public.is_org_manager(organisation_id));
create policy incidents_insert on public.incident_reports for insert with check (
  reported_by = auth.uid() and public.is_org_member(organisation_id)
  and status = 'open' and reviewed_by is null
);
create policy incidents_manage on public.incident_reports for update
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Expenses / travel / extra hours: staff create & read own, edit while pending;
-- managers review.
create policy expenses_select on public.expense_claims for select
  using (staff_user_id = auth.uid() or public.is_org_manager(organisation_id));
create policy expenses_insert on public.expense_claims for insert with check (
  staff_user_id = auth.uid() and public.is_org_member(organisation_id) and status = 'pending'
);
create policy expenses_update_own on public.expense_claims for update
  using (staff_user_id = auth.uid() and status = 'pending')
  with check (staff_user_id = auth.uid() and status = 'pending');
create policy expenses_manage on public.expense_claims for update
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

create policy travel_select on public.travel_logs for select
  using (staff_user_id = auth.uid() or public.is_org_manager(organisation_id));
create policy travel_insert on public.travel_logs for insert with check (
  staff_user_id = auth.uid() and public.is_org_member(organisation_id) and status = 'pending'
);
create policy travel_update_own on public.travel_logs for update
  using (staff_user_id = auth.uid() and status = 'pending')
  with check (staff_user_id = auth.uid() and status = 'pending');
create policy travel_manage on public.travel_logs for update
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

create policy adjustments_select on public.timesheet_adjustments for select
  using (staff_user_id = auth.uid() or public.is_org_manager(organisation_id));
create policy adjustments_insert on public.timesheet_adjustments for insert with check (
  staff_user_id = auth.uid() and status = 'pending'
  and exists (select 1 from public.shifts s
              where s.id = shift_id and s.staff_user_id = auth.uid()
                and s.organisation_id = timesheet_adjustments.organisation_id)
);
create policy adjustments_manage on public.timesheet_adjustments for update
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Public holidays: readable by all signed-in users; org admins manage their own rows
create policy holidays_select on public.public_holidays for select
  using (auth.uid() is not null and (organisation_id is null or public.is_org_member(organisation_id)));
create policy holidays_manage on public.public_holidays for all
  using (organisation_id is not null and public.is_org_admin(organisation_id))
  with check (organisation_id is not null and public.is_org_admin(organisation_id));

-- Audit log: admins read; nobody writes directly
create policy audit_select on public.audit_log for select
  using (public.is_org_admin(organisation_id));

-- =============================================================================
-- RPC functions (security definer, validated inside)
-- =============================================================================

-- SaaS signup: create an organisation and make the caller its owner
create or replace function public.create_organisation(p_name text, p_slug text, p_state public.au_state default 'NSW')
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.organisations (name, slug, state)
  values (p_name, lower(p_slug), p_state)
  returning id into v_org;
  insert into public.org_members (organisation_id, user_id, role)
  values (v_org, auth.uid(), 'owner');
  return v_org;
end $$;

-- Accept an invitation: the signed-in user's email must match
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select * into v_inv from public.invitations
  where token = p_token and accepted_at is null and expires_at > now()
  for update;
  if not found then raise exception 'Invitation is invalid or has expired'; end if;
  if v_inv.email <> v_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.org_members (organisation_id, user_id, role)
  values (v_inv.organisation_id, auth.uid(), v_inv.role)
  on conflict (organisation_id, user_id) do update set status = 'active';

  update public.invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.organisation_id;
end $$;

-- Clock in / out for the assigned staff member
create or replace function public.clock_in(p_shift uuid, p_lat double precision default null, p_lng double precision default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.shifts
     set clock_in_at = now(), clock_in_lat = p_lat, clock_in_lng = p_lng, status = 'in_progress'
   where id = p_shift and staff_user_id = auth.uid()
     and status = 'published' and clock_in_at is null
     and now() between starts_at - interval '2 hours' and ends_at;
  if not found then raise exception 'Unable to clock in to this shift'; end if;
end $$;

create or replace function public.clock_out(p_shift uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.shifts
     set clock_out_at = now(), status = 'completed'
   where id = p_shift and staff_user_id = auth.uid()
     and status = 'in_progress' and clock_out_at is null;
  if not found then raise exception 'Unable to clock out of this shift'; end if;
end $$;

-- Approve / reject a claim (expenses, travel, extra hours) in one place
create or replace function public.review_claim(p_table text, p_id uuid, p_status public.claim_status, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_table not in ('expense_claims','travel_logs','timesheet_adjustments') then
    raise exception 'Unknown claim type';
  end if;
  if p_status = 'pending' then raise exception 'Choose approved or rejected'; end if;
  execute format('select organisation_id from public.%I where id = $1', p_table) into v_org using p_id;
  if v_org is null or not public.is_org_manager(v_org) then raise exception 'Not permitted'; end if;

  if p_table = 'travel_logs' then
    execute format('update public.%I set status = $1, reviewed_by = auth.uid(), reviewed_at = now() where id = $2', p_table)
      using p_status, p_id;
  else
    execute format('update public.%I set status = $1, reviewed_by = auth.uid(), reviewed_at = now(), review_notes = $3 where id = $2', p_table)
      using p_status, p_id, p_notes;
  end if;
end $$;

-- Look up an invitation by token (for the accept page, before sign-in)
create or replace function public.invitation_preview(p_token text)
returns table (organisation_name text, email text, role public.org_role, logo_path text, brand_primary text)
language sql stable security definer set search_path = public as $$
  select o.name, i.email, i.role, o.logo_path, o.brand_primary
  from public.invitations i join public.organisations o on o.id = i.organisation_id
  where i.token = p_token and i.accepted_at is null and i.expires_at > now();
$$;

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- =============================================================================
-- Storage buckets
--   org-assets: logos (public read), path = <org_id>/...
--   receipts:   expense receipts (private), path = <org_id>/<user_id>/...
-- =============================================================================
insert into storage.buckets (id, name, public) values
  ('org-assets', 'org-assets', true),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy org_assets_admin_write on storage.objects for all
  using (bucket_id = 'org-assets' and public.is_org_admin(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'org-assets' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

create policy receipts_owner_insert on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy receipts_read on storage.objects for select
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_org_manager(((storage.foldername(name))[1])::uuid)
    )
  );
