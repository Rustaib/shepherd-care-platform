-- =============================================================================
-- 1. Appointments can be linked to a shift, and remind the worker beforehand.
-- 2. Managers choose which "something was logged" emails they receive.
-- =============================================================================
alter table public.appointments
  add column shift_id uuid references public.shifts(id) on delete set null,
  add column reminder_sent_at timestamptz;
create index on public.appointments (shift_id);
create index on public.appointments (starts_at) where reminder_sent_at is null;

-- The linked shift must belong to the same organisation and participant
create or replace function public.check_appointment_shift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shift_id is not null and not exists (
    select 1 from public.shifts s
    where s.id = new.shift_id and s.organisation_id = new.organisation_id
      and (s.participant_id is null or s.participant_id = new.participant_id)
  ) then
    raise exception 'The linked shift must be for the same participant';
  end if;
  -- Moving the appointment means it should be reminded again
  if tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
  end if;
  return new;
end $$;
create trigger trg_appointments_shift before insert or update on public.appointments
  for each row execute function public.check_appointment_shift();

-- Email preferences per manager (null = default: on for owners and admins)
alter table public.org_members
  add column notify_progress_notes boolean,
  add column notify_expenses boolean,
  add column notify_travel boolean,
  add column notify_incidents boolean;

-- Members change their own preferences through this function (the members
-- table itself is admin-only).
create or replace function public.set_my_notifications(
  p_org uuid, p_progress_notes boolean, p_expenses boolean, p_travel boolean, p_incidents boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.org_members
     set notify_progress_notes = p_progress_notes, notify_expenses = p_expenses,
         notify_travel = p_travel, notify_incidents = p_incidents
   where organisation_id = p_org and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not a member of this organisation'; end if;
end $$;
revoke all on function public.set_my_notifications(uuid, boolean, boolean, boolean, boolean) from public;
grant execute on function public.set_my_notifications(uuid, boolean, boolean, boolean, boolean) to authenticated;
