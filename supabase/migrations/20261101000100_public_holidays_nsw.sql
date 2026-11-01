-- NSW public holidays 2026–2027 (source: NSW Department of Education public
-- holiday calendar). Bank Holiday (first Monday in August) is NOT a public
-- holiday and is deliberately excluded. Other states are added the same way.
insert into public.public_holidays (organisation_id, state, holiday_date, name) values
  (null,'NSW','2026-01-01','New Year''s Day'),
  (null,'NSW','2026-01-26','Australia Day'),
  (null,'NSW','2026-04-03','Good Friday'),
  (null,'NSW','2026-04-04','Easter Saturday'),
  (null,'NSW','2026-04-05','Easter Sunday'),
  (null,'NSW','2026-04-06','Easter Monday'),
  (null,'NSW','2026-04-25','Anzac Day'),
  (null,'NSW','2026-06-08','King''s Birthday'),
  (null,'NSW','2026-10-05','Labour Day'),
  (null,'NSW','2026-12-25','Christmas Day'),
  (null,'NSW','2026-12-26','Boxing Day'),
  (null,'NSW','2026-12-28','Boxing Day (additional day)'),
  (null,'NSW','2027-01-01','New Year''s Day'),
  (null,'NSW','2027-01-26','Australia Day'),
  (null,'NSW','2027-03-26','Good Friday'),
  (null,'NSW','2027-03-27','Easter Saturday'),
  (null,'NSW','2027-03-28','Easter Sunday'),
  (null,'NSW','2027-03-29','Easter Monday'),
  (null,'NSW','2027-04-25','Anzac Day'),
  (null,'NSW','2027-06-14','King''s Birthday'),
  (null,'NSW','2027-10-04','Labour Day'),
  (null,'NSW','2027-12-25','Christmas Day'),
  (null,'NSW','2027-12-26','Boxing Day'),
  (null,'NSW','2027-12-27','Christmas Day (additional day)'),
  (null,'NSW','2027-12-28','Boxing Day (additional day)')
on conflict do nothing;
