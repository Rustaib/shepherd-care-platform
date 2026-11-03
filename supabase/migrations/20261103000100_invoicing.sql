-- =============================================================================
-- Invoicing
--   services          price list: NDIS support item + rate for each time of day
--   invoice_settings  per-organisation template, numbering and email defaults
--   invoices          one per participant per period; Generated → Sent → Paid
--   invoice_lines     snapshot of what was billed (a shift can only be billed once)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Services (rate cards)
-- ---------------------------------------------------------------------------
create table public.services (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  name                  text not null,                 -- e.g. Assistance With Self Care Activities Standard
  category_label        text,                          -- e.g. "01" shown before the name on invoices
  unit                  text not null default 'Hours' check (unit in ('Hours', 'Each')),
  weekday_code          text, weekday_rate          numeric(10,2),
  evening_code          text, evening_rate          numeric(10,2),
  night_code            text, night_rate            numeric(10,2),
  saturday_code         text, saturday_rate         numeric(10,2),
  sunday_code           text, sunday_rate           numeric(10,2),
  public_holiday_code   text, public_holiday_rate   numeric(10,2),
  travel_code           text,                          -- provider travel (non-labour), billed per km
  active                boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organisation_id, name)
);
create trigger trg_services_updated before update on public.services
  for each row execute function public.set_updated_at();
alter table public.services enable row level security;
create policy services_select on public.services for select using (public.is_org_member(organisation_id));
create policy services_manage on public.services for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

alter table public.shifts
  add column service_id uuid references public.services(id) on delete set null,
  add column estimated_rate numeric(10,2);   -- blended $/h from the price list, for budget tracking

-- Budget usage uses the explicit rate, else the price-list estimate
create or replace view public.plan_budget_usage
with (security_invoker = true) as
with shift_cost as (
  select
    s.plan_budget_id,
    s.status,
    coalesce(s.charge_rate, s.estimated_rate, 0) * (
      extract(epoch from (s.ends_at - s.starts_at)) / 3600.0
      - s.break_minutes / 60.0
      + coalesce((
          select sum(a.extra_minutes) / 60.0
          from public.timesheet_adjustments a
          where a.shift_id = s.id and a.status = 'approved'
        ), 0)
    ) as cost
  from public.shifts s
  where s.plan_budget_id is not null
)
select
  b.id                as plan_budget_id,
  b.organisation_id,
  b.plan_id,
  b.category,
  b.allocated_amount,
  round(coalesce(sum(c.cost) filter (where c.status = 'completed'), 0)::numeric, 2) as spent,
  round(coalesce(sum(c.cost) filter (where c.status in ('published','in_progress')), 0)::numeric, 2) as committed
from public.plan_budgets b
left join shift_cost c on c.plan_budget_id = b.id
group by b.id;

-- Who invoices go to
alter table public.participants
  add column support_coordinator_name  text,
  add column support_coordinator_email text,
  add column invoice_emails            text;   -- extra recipients, comma separated

-- ---------------------------------------------------------------------------
-- Invoice settings (template)
-- ---------------------------------------------------------------------------
create table public.invoice_settings (
  organisation_id      uuid primary key references public.organisations(id) on delete cascade,
  title                text not null default 'Tax Invoice',
  number_prefix        text not null default '',
  next_number          bigint not null default 1001 check (next_number > 0),
  payment_terms_days   smallint not null default 7 check (payment_terms_days between 0 and 120),
  business_name        text,          -- defaults to the organisation name
  address              text,
  phone                text,
  email                text,          -- also used as reply-to on invoice emails
  payment_details      text,          -- e.g. bank name, BSB, account
  footer               text,
  line_format          text not null default '{participant} @ {date} {start} - {end} [{service}] [{code}]',
  show_tax_column      boolean not null default true,
  km_rate              numeric(6,2) not null default 0.99 check (km_rate >= 0),
  ndia_registration_number text,     -- 10-digit provider number for NDIA bulk claims
  account_code         text not null default '200',   -- income account for accounting exports
  tax_type             text not null default 'GST Free Income',
  email_subject        text not null default '{title} {invoice_number} for {participant} ({period})',
  email_body           text not null default
    E'Hi,\n\nPlease find attached {title_lower} {invoice_number} for {participant} for supports delivered {period}.\n\nTotal: {total}, due {due_date}.\n\nKind regards,\n{business_name}',
  updated_at           timestamptz not null default now()
);
create trigger trg_invoice_settings_updated before update on public.invoice_settings
  for each row execute function public.set_updated_at();
alter table public.invoice_settings enable row level security;
create policy invoice_settings_select on public.invoice_settings for select using (public.is_org_manager(organisation_id));
create policy invoice_settings_manage on public.invoice_settings for all
  using (public.is_org_admin(organisation_id)) with check (public.is_org_admin(organisation_id));

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('generated', 'sent', 'paid', 'void');

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id  uuid not null references public.participants(id) on delete restrict,
  invoice_number  text not null,
  period_start    date not null,
  period_end      date not null,
  issue_date      date not null,
  due_date        date not null,
  status          public.invoice_status not null default 'generated',
  subtotal        numeric(12,2) not null default 0,
  tax             numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  pdf_path        text,
  bill_to         jsonb not null default '{}',   -- snapshot of the participant's details
  sent_at         timestamptz,
  sent_to         text[],
  sent_by         uuid references public.profiles(id),
  paid_at         date,
  void_reason     text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, invoice_number),
  check (period_end >= period_start)
);
create index on public.invoices (organisation_id, status, issue_date desc);
create index on public.invoices (participant_id, period_start);
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind            text not null check (kind in ('service', 'travel')),
  shift_id        uuid references public.shifts(id) on delete set null,
  service_date    date not null,
  description     text not null,
  support_item_code text,
  unit            text not null default 'Hours',
  quantity        numeric(10,2) not null,
  unit_price      numeric(10,2) not null,
  tax             numeric(10,2) not null default 0,
  amount          numeric(12,2) not null,
  sort_order      integer not null default 0
);
create index on public.invoice_lines (invoice_id, sort_order);
create index on public.invoice_lines (shift_id);

-- A shift's service (or travel) can only be on one live invoice
create or replace function public.check_invoice_line_unique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shift_id is not null and exists (
    select 1 from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
    where l.shift_id = new.shift_id and l.kind = new.kind and l.id <> new.id
      and l.invoice_id <> new.invoice_id and i.status <> 'void'
  ) then
    raise exception 'Shift % is already on another invoice', new.shift_id using errcode = '23505';
  end if;
  return new;
end $$;
create trigger trg_invoice_lines_unique before insert or update on public.invoice_lines
  for each row execute function public.check_invoice_line_unique();

-- Invoices are managed by managers; workers never see them
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy invoices_manage on public.invoices for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
create policy invoice_lines_manage on public.invoice_lines for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

do $$ begin
  execute 'create trigger trg_invoices_audit after insert or update or delete on public.invoices for each row execute function public.write_audit()';
end $$;

-- Reserve the next invoice number(s) atomically
create or replace function public.allocate_invoice_numbers(p_org uuid, p_count integer)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_first bigint;
begin
  if not public.is_org_manager(p_org) then raise exception 'Not permitted'; end if;
  if p_count < 1 or p_count > 500 then raise exception 'Invalid count'; end if;
  insert into public.invoice_settings (organisation_id) values (p_org) on conflict do nothing;
  update public.invoice_settings set next_number = next_number + p_count
   where organisation_id = p_org
   returning next_number - p_count into v_first;
  return v_first;
end $$;
revoke all on function public.allocate_invoice_numbers(uuid, integer) from public;
grant execute on function public.allocate_invoice_numbers(uuid, integer) to authenticated;

-- Grants (tables are not exposed to the API automatically)
grant select, insert, update, delete on public.services, public.invoice_settings, public.invoices, public.invoice_lines to authenticated;
grant all on public.services, public.invoice_settings, public.invoices, public.invoice_lines to service_role;
grant select on public.plan_budget_usage to authenticated;

-- Private bucket for invoice PDFs: <org_id>/<invoice_id>.pdf
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false) on conflict (id) do nothing;
create policy invoices_files on storage.objects for all
  using (bucket_id = 'invoices' and public.is_org_manager(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'invoices' and public.is_org_manager(((storage.foldername(name))[1])::uuid));
