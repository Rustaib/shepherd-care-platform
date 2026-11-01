-- =============================================================================
-- Staff mobile flow: push subscriptions, tighter note/claim rules
-- =============================================================================

-- Browser push subscriptions (one row per device)
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notes, incidents, expenses and km logged against a shift must be the
-- author's own shift (a worker can't attach records to someone else's shift).
create or replace function public.is_own_shift(p_shift uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_shift is null or exists (
    select 1 from public.shifts where id = p_shift and staff_user_id = auth.uid()
  );
$$;

drop policy notes_insert on public.progress_notes;
create policy notes_insert on public.progress_notes for insert with check (
  author_id = auth.uid()
  and public.is_org_member(organisation_id)
  and public.can_view_participant(participant_id)
  and public.is_own_shift(shift_id)
);

drop policy incidents_insert on public.incident_reports;
create policy incidents_insert on public.incident_reports for insert with check (
  reported_by = auth.uid() and public.is_org_member(organisation_id)
  and status = 'open' and reviewed_by is null
  and public.is_own_shift(shift_id)
);

drop policy expenses_insert on public.expense_claims;
create policy expenses_insert on public.expense_claims for insert with check (
  staff_user_id = auth.uid() and public.is_org_member(organisation_id) and status = 'pending'
  and public.is_own_shift(shift_id)
);

drop policy travel_insert on public.travel_logs;
create policy travel_insert on public.travel_logs for insert with check (
  staff_user_id = auth.uid() and public.is_org_member(organisation_id) and status = 'pending'
  and public.is_own_shift(shift_id)
);

-- Staff may withdraw their own pending claims
create policy expenses_delete_own on public.expense_claims for delete
  using (staff_user_id = auth.uid() and status = 'pending');
create policy travel_delete_own on public.travel_logs for delete
  using (staff_user_id = auth.uid() and status = 'pending');
create policy adjustments_delete_own on public.timesheet_adjustments for delete
  using (staff_user_id = auth.uid() and status = 'pending');

-- One open extra-hours request per shift
create unique index timesheet_adjustments_one_pending
  on public.timesheet_adjustments (shift_id) where status = 'pending';
