-- =============================================================================
-- Explicit API grants. Supabase stopped exposing new tables to the Data API
-- automatically (default for new projects from 30 May 2026; all projects from
-- 30 Oct 2026), so every table the app reads or writes is granted here.
-- Row-level security still decides which rows each user can touch.
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.profiles, public.org_members, public.invitations,
  public.participants, public.ndis_plans, public.plan_budgets,
  public.shifts, public.appointments, public.progress_notes,
  public.incident_reports, public.expense_claims, public.travel_logs,
  public.timesheet_adjustments, public.public_holidays, public.push_subscriptions
to authenticated;

-- Organisations: read, plus update of the profile/branding columns only
-- (domain and billing columns stay server-managed).
grant select on public.organisations to authenticated;
grant update (
  name, abn, ndis_registration_number, state, timezone, logo_path,
  brand_primary, brand_secondary, brand_accent,
  reminder_hour_local, progress_note_lock_hours
) on public.organisations to authenticated;

grant select on public.audit_log, public.plan_budget_usage to authenticated;

-- Server-side (secret key) access for reminders, domains and billing
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- RPCs and the helper functions used inside security policies
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text), public.org_by_host(text) to anon;
