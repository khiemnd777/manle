alter table if exists price_tiers
  add column if not exists benefit_editor_enabled boolean not null default false;

update price_tiers pt
set benefit_editor_enabled = coalesce(te.enabled, false) and coalesce(te.value, 'false'::jsonb) = 'true'::jsonb
from tier_entitlements te
where te.tier_code = pt.code
  and te.entitlement_key = 'benefit_editor';
