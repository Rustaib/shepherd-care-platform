-- A support worker can't be booked on two overlapping shifts. The app checks
-- first and shows a friendly message; this constraint is the safety net
-- (e.g. two coordinators rostering at the same moment).
create extension if not exists btree_gist;

alter table public.shifts
  add constraint shifts_no_staff_overlap
  exclude using gist (
    staff_user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (staff_user_id is not null and status <> 'cancelled');
