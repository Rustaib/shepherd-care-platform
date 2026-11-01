-- =============================================================================
-- Budget usage: how much of each plan budget has been used or is booked.
--   spent     = completed shifts (rostered hours less breaks) + approved extra
--               hours, at the shift's charge rate
--   committed = upcoming / in-progress shifts not yet completed
-- security_invoker means the caller's row-level security applies.
-- =============================================================================

create or replace view public.plan_budget_usage
with (security_invoker = true) as
with shift_cost as (
  select
    s.plan_budget_id,
    s.status,
    coalesce(s.charge_rate, 0) * (
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

grant select on public.plan_budget_usage to authenticated;
