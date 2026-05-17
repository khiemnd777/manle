insert into entitlements (key, label, description, value_type, default_value) values
  ('benefit_editor', 'Benefit editor', 'Allow managing Living Benefit 2 columns and items.', 'boolean', 'false'::jsonb)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  value_type = excluded.value_type,
  default_value = excluded.default_value,
  updated_at = now();

insert into tier_entitlements (tier_code, entitlement_key, enabled, value) values
  ('free', 'benefit_editor', false, 'false'::jsonb),
  ('basic', 'benefit_editor', false, 'false'::jsonb),
  ('plus', 'benefit_editor', false, 'false'::jsonb),
  ('pro', 'benefit_editor', true, 'true'::jsonb)
on conflict (tier_code, entitlement_key) do nothing;
