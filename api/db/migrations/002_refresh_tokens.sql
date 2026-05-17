create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  family_id uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_token_hash text,
  created_at timestamptz not null default now()
);

create index if not exists refresh_tokens_user_idx on refresh_tokens (user_id);
create index if not exists refresh_tokens_family_idx on refresh_tokens (family_id);
create index if not exists refresh_tokens_expires_idx on refresh_tokens (expires_at);
