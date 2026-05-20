create table if not exists oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'apple')),
  provider_user_id text not null,
  email text,
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists oauth_accounts_user_idx on oauth_accounts (user_id);
create index if not exists oauth_accounts_email_idx on oauth_accounts (lower(email));
