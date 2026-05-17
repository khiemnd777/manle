create extension if not exists pgcrypto;

create table if not exists price_tiers (
  code text primary key,
  name text not null,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  paddle_price_id text,
  export_limit_per_day integer not null default 0 check (export_limit_per_day >= 0),
  watermark_enabled boolean not null default true,
  branding_enabled boolean not null default false,
  style_editor_enabled boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into price_tiers (
  code, name, monthly_price_cents, export_limit_per_day,
  watermark_enabled, branding_enabled, style_editor_enabled, sort_order
) values
  ('free', 'Free', 0, 3, true, false, false, 10),
  ('basic', 'Basic', 1000, 10, false, false, false, 20),
  ('plus', 'Plus', 2000, 20, false, true, false, 30),
  ('pro', 'Pro', 5000, 50, false, true, true, 40)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  export_limit_per_day = excluded.export_limit_per_day,
  watermark_enabled = excluded.watermark_enabled,
  branding_enabled = excluded.branding_enabled,
  style_editor_enabled = excluded.style_editor_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  password_hash text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  current_tier_code text not null default 'free' references price_tiers(code),
  paddle_customer_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_uidx on users (lower(email));
create index if not exists users_role_status_idx on users (role, status);
create index if not exists users_paddle_customer_idx on users (paddle_customer_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  paddle_customer_id text,
  paddle_subscription_id text unique,
  status text not null default 'active',
  tier_code text not null references price_tiers(code),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  manual_override boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on subscriptions (user_id);
create index if not exists subscriptions_status_idx on subscriptions (status);
create index if not exists subscriptions_paddle_customer_idx on subscriptions (paddle_customer_id);

create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  tier_code text references price_tiers(code),
  discount_type text not null default 'percent' check (discount_type in ('percent', 'amount', 'trial', 'custom')),
  discount_value integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  paddle_discount_id text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotions_active_idx on promotions (active);
create index if not exists promotions_tier_idx on promotions (tier_code);

create table if not exists entitlements (
  key text primary key,
  label text not null,
  description text not null default '',
  value_type text not null check (value_type in ('boolean', 'number', 'string')),
  default_value jsonb not null default 'false'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into entitlements (key, label, description, value_type, default_value) values
  ('watermark', 'Watermark', 'Show MANLE watermark on exported cards.', 'boolean', 'true'::jsonb),
  ('exports_per_day', 'Exports per day', 'Maximum PDF/PNG/JPG exports per calendar day.', 'number', '3'::jsonb),
  ('branding', 'Branding', 'Allow custom logo and header branding controls.', 'boolean', 'false'::jsonb),
  ('style_editor', 'Style editor', 'Allow advanced color and font customization.', 'boolean', 'false'::jsonb)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  value_type = excluded.value_type,
  default_value = excluded.default_value,
  updated_at = now();

create table if not exists tier_entitlements (
  tier_code text not null references price_tiers(code) on delete cascade,
  entitlement_key text not null references entitlements(key) on delete cascade,
  enabled boolean not null default true,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tier_code, entitlement_key)
);

insert into tier_entitlements (tier_code, entitlement_key, enabled, value) values
  ('free', 'watermark', true, 'true'::jsonb),
  ('free', 'exports_per_day', true, '3'::jsonb),
  ('free', 'branding', false, 'false'::jsonb),
  ('free', 'style_editor', false, 'false'::jsonb),
  ('basic', 'watermark', false, 'false'::jsonb),
  ('basic', 'exports_per_day', true, '10'::jsonb),
  ('basic', 'branding', false, 'false'::jsonb),
  ('basic', 'style_editor', false, 'false'::jsonb),
  ('plus', 'watermark', false, 'false'::jsonb),
  ('plus', 'exports_per_day', true, '20'::jsonb),
  ('plus', 'branding', true, 'true'::jsonb),
  ('plus', 'style_editor', false, 'false'::jsonb),
  ('pro', 'watermark', false, 'false'::jsonb),
  ('pro', 'exports_per_day', true, '50'::jsonb),
  ('pro', 'branding', true, 'true'::jsonb),
  ('pro', 'style_editor', true, 'true'::jsonb)
on conflict (tier_code, entitlement_key) do update set
  enabled = excluded.enabled,
  value = excluded.value,
  updated_at = now();

create table if not exists export_usage (
  user_id uuid not null references users(id) on delete cascade,
  usage_date date not null,
  export_count integer not null default 0,
  tier_code text not null references price_tiers(code),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists paddle_events (
  paddle_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_time_idx on audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_target_idx on audit_logs (target_type, target_id);
