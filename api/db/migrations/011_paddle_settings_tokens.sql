alter table paddle_settings
  add column if not exists client_token text not null default '',
  add column if not exists webhook_secret text not null default '';
