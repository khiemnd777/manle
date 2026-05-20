create table if not exists email_settings (
  id boolean primary key default true check (id),
  provider text not null default 'resend' check (provider = 'resend'),
  enabled boolean not null default false,
  resend_api_key text not null default '',
  from_email text not null default '',
  from_name text not null default 'MANLE',
  reply_to_email text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into email_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists email_templates (
  key text primary key,
  name text not null,
  description text not null default '',
  subject text not null,
  html_body text not null default '',
  text_body text not null default '',
  enabled boolean not null default true,
  system boolean not null default false,
  variables jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into email_templates (
  key, name, description, subject, html_body, text_body, enabled, system, variables
) values
  (
    'password_reset',
    'Forgot password',
    'Sent when a user requests a password reset link.',
    'Reset your MANLE password',
    $$<p>Hi {{name}},</p>
<p>Use the link below to reset your MANLE password. This link expires in {{expiresMinutes}} minutes.</p>
<p><a href="{{resetUrl}}">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>$$,
    $$Hi {{name}},

Use this link to reset your MANLE password. It expires in {{expiresMinutes}} minutes:
{{resetUrl}}

If you did not request this, you can ignore this email.$$,
    true,
    true,
    $$[
      {"text":"name","label":"Customer name"},
      {"text":"email","label":"Customer email"},
      {"text":"resetUrl","label":"Password reset link"},
      {"text":"expiresMinutes","label":"Expiry minutes"},
      {"text":"appName","label":"App name"}
    ]$$::jsonb
  ),
  (
    'user_greeting',
    'Greeting email for new user',
    'Sent after a new customer account is created.',
    'Welcome to MANLE',
    $$<p>Hi {{name}},</p>
<p>Welcome to MANLE. Your account is ready for generating client cards.</p>
<p>You can sign in with {{email}}.</p>$$,
    $$Hi {{name}},

Welcome to MANLE. Your account is ready for generating client cards.

You can sign in with {{email}}.$$,
    true,
    true,
    $$[
      {"text":"name","label":"Customer name"},
      {"text":"email","label":"Customer email"},
      {"text":"appName","label":"App name"}
    ]$$::jsonb
  ),
  (
    'payment_confirmation',
    'Payment confirmation',
    'Sent when Paddle confirms a completed transaction.',
    'MANLE payment confirmed',
    $$<p>Hi {{name}},</p>
<p>Your MANLE payment has been confirmed.</p>
<p>Tier: {{tierCode}}<br>Amount: {{amount}} {{currency}}<br>Transaction: {{transactionId}}</p>
<p>Thank you for using MANLE.</p>$$,
    $$Hi {{name}},

Your MANLE payment has been confirmed.

Tier: {{tierCode}}
Amount: {{amount}} {{currency}}
Transaction: {{transactionId}}

Thank you for using MANLE.$$,
    true,
    true,
    $$[
      {"text":"name","label":"Customer name"},
      {"text":"email","label":"Customer email"},
      {"text":"tierCode","label":"Tier code"},
      {"text":"amount","label":"Payment amount"},
      {"text":"currency","label":"Currency"},
      {"text":"transactionId","label":"Paddle transaction ID"},
      {"text":"subscriptionId","label":"Paddle subscription ID"},
      {"text":"paymentDate","label":"Payment date"},
      {"text":"appName","label":"App name"}
    ]$$::jsonb
  )
on conflict (key) do nothing;

create table if not exists email_send_logs (
  id uuid primary key default gen_random_uuid(),
  template_key text references email_templates(key) on delete set null,
  recipient_email text not null,
  provider text not null default 'resend',
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists email_send_logs_template_time_idx on email_send_logs (template_key, created_at desc);
create index if not exists email_send_logs_recipient_time_idx on email_send_logs (recipient_email, created_at desc);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_time_idx on password_reset_tokens (user_id, created_at desc);
create index if not exists password_reset_tokens_expires_idx on password_reset_tokens (expires_at);
