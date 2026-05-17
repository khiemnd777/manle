alter table if exists price_tiers
  add column if not exists pricing_badge text not null default '';

update price_tiers
set pricing_badge = 'Popular'
where code = 'plus'
  and pricing_badge = '';
