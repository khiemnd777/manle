create table if not exists illustration_carrier_assets (
  id uuid primary key default gen_random_uuid(),
  carrier text not null,
  logo_data_url text,
  logo_mime_type text,
  logo_file_name text,
  logo_file_size_bytes bigint not null default 0 check (logo_file_size_bytes >= 0),
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_data_url is null or length(logo_data_url) <= 1048576),
  check (logo_mime_type is null or logo_mime_type in ('image/png', 'image/jpeg', 'image/webp'))
);

create unique index if not exists illustration_carrier_assets_carrier_uidx
  on illustration_carrier_assets (lower(carrier));
