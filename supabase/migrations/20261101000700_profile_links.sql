-- Point "who did this" columns at profiles (which mirror auth.users one-to-one)
-- so the API can join names, e.g. author:profiles(full_name).
alter table public.progress_notes drop constraint progress_notes_author_id_fkey,
  add constraint progress_notes_author_id_fkey foreign key (author_id) references public.profiles(id);
alter table public.incident_reports drop constraint incident_reports_reported_by_fkey,
  add constraint incident_reports_reported_by_fkey foreign key (reported_by) references public.profiles(id);
alter table public.expense_claims drop constraint expense_claims_staff_user_id_fkey,
  add constraint expense_claims_staff_user_id_fkey foreign key (staff_user_id) references public.profiles(id);
alter table public.travel_logs drop constraint travel_logs_staff_user_id_fkey,
  add constraint travel_logs_staff_user_id_fkey foreign key (staff_user_id) references public.profiles(id);
alter table public.timesheet_adjustments drop constraint timesheet_adjustments_staff_user_id_fkey,
  add constraint timesheet_adjustments_staff_user_id_fkey foreign key (staff_user_id) references public.profiles(id);
