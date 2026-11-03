-- Price book import: per-service km rate and the date the prices took effect.
alter table public.services
  add column travel_rate numeric(10,2) check (travel_rate is null or travel_rate >= 0),
  add column effective_from date;
