-- Bulk (SIL-style) charging: a participant is charged an agreed amount per week or per month
-- instead of per shift. Shifts on a weekly/monthly service are covered by the charge.

alter table public.services drop constraint if exists services_unit_check;
alter table public.services add constraint services_unit_check check (unit in ('Hours', 'Each', 'Week', 'Month'));

create table public.participant_charges (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  participant_id    uuid not null references public.participants(id) on delete cascade,
  service_id        uuid references public.services(id) on delete set null,
  description       text,                           -- e.g. "SIL – 2:3 shared, roster of care v3"
  frequency         text not null check (frequency in ('week', 'month')),
  amount            numeric(12,2) not null check (amount >= 0),   -- per week / per month
  support_item_code text,                           -- falls back to the service's item code
  start_date        date not null,
  end_date          date,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on public.participant_charges (participant_id, start_date);
create trigger trg_participant_charges_updated before update on public.participant_charges
  for each row execute function public.set_updated_at();
alter table public.participant_charges enable row level security;
create policy participant_charges_manage on public.participant_charges for all
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
do $$ begin
  execute 'create trigger trg_participant_charges_audit after insert or update or delete on public.participant_charges for each row execute function public.write_audit()';
end $$;
grant select, insert, update, delete on public.participant_charges to authenticated;
grant all on public.participant_charges to service_role;

-- Invoice lines for bulk charges: one per week/month, never billed twice
alter table public.invoice_lines drop constraint if exists invoice_lines_kind_check;
alter table public.invoice_lines add constraint invoice_lines_kind_check check (kind in ('service', 'travel', 'charge'));
alter table public.invoice_lines
  add column charge_id uuid references public.participant_charges(id) on delete set null,
  add column period_start date,
  add column period_end date;
create index on public.invoice_lines (charge_id, period_start);

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
  if new.charge_id is not null and exists (
    select 1 from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
    where l.charge_id = new.charge_id and l.period_start = new.period_start and l.id <> new.id
      and l.invoice_id <> new.invoice_id and i.status <> 'void'
  ) then
    raise exception 'That % is already on another invoice', new.period_start using errcode = '23505';
  end if;
  return new;
end $$;
