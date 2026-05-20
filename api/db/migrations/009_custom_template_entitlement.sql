insert into entitlements (key, label, description, value_type, default_value) values
  ('custom_template', 'Custom Template', 'Allow using custom card templates.', 'boolean', 'false'::jsonb)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  value_type = excluded.value_type,
  default_value = excluded.default_value,
  updated_at = now();

insert into tier_entitlements (tier_code, entitlement_key, enabled, value) values
  ('free', 'custom_template', false, 'false'::jsonb),
  ('basic', 'custom_template', false, 'false'::jsonb),
  ('plus', 'custom_template', false, 'false'::jsonb),
  ('pro', 'custom_template', false, 'false'::jsonb)
on conflict (tier_code, entitlement_key) do nothing;
