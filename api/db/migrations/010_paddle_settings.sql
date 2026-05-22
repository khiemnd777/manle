create table if not exists paddle_settings (
  id boolean primary key default true check (id),
  api_key text not null default '',
  client_token text not null default '',
  webhook_secret text not null default '',
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into paddle_settings (id)
values (true)
on conflict (id) do nothing;
