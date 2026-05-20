import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';
import { audit } from './admin';

const RESEND_EMAIL_API = 'https://api.resend.com/emails';

type EmailSettingsRow = {
  provider: 'resend';
  enabled: boolean;
  resendApiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  updatedAt: string | Date;
};

export type EmailSettingsInput = {
  enabled?: boolean;
  resendApiKey?: string;
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string | null;
};

export type EmailTemplateInput = {
  key?: string;
  name?: string;
  description?: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  enabled?: boolean;
  variables?: unknown;
};

type SendTemplateOptions = {
  strict?: boolean;
};

type EmailVariable = {
  text: string;
  label: string;
};

function cleanText(value?: string | null) {
  return (value || '').trim();
}

function cleanEmail(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function validEmail(value: string) {
  return value.includes('@') && value.includes('.');
}

function cleanTemplateKey(value?: string) {
  const key = cleanText(value).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,80}$/.test(key)) {
    fail(400, 'invalid_template_key', 'Template key must use lowercase letters, numbers, dots, dashes, or underscores.');
  }
  return key;
}

function variableText(value: string) {
  return cleanText(value).replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
}

function normalizeVariables(value: unknown): EmailVariable[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const variables: EmailVariable[] = [];
  for (const item of value) {
    const text = typeof item === 'string'
      ? variableText(item)
      : variableText(String((item as any)?.text || (item as any)?.label || ''));
    if (!text || seen.has(text)) continue;
    seen.add(text);
    variables.push({
      text,
      label: `{{${text}}}`,
    });
  }
  return variables;
}

function normalizeVariableMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue;
    result[key] = raw == null ? '' : String(raw);
  }
  return result;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function renderTemplate(source: string, variables: Record<string, string>, escape = false) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = variables[key] ?? '';
    return escape ? escapeHtml(value) : value;
  });
}

function redactedSettings(row: EmailSettingsRow) {
  const apiKey = row.resendApiKey || '';
  return {
    provider: row.provider,
    enabled: row.enabled,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    replyToEmail: row.replyToEmail,
    hasResendApiKey: Boolean(apiKey),
    resendApiKeyPreview: apiKey ? `...${apiKey.slice(-4)}` : null,
    updatedAt: row.updatedAt,
  };
}

async function settingsRow() {
  const sql = db();
  const row = await one<EmailSettingsRow>(sql`
    select
      provider,
      enabled,
      resend_api_key as "resendApiKey",
      from_email as "fromEmail",
      from_name as "fromName",
      reply_to_email as "replyToEmail",
      updated_at as "updatedAt"
    from email_settings
    where id = true
    limit 1
  `);
  if (row) return row;
  const inserted = await one<EmailSettingsRow>(sql`
    insert into email_settings (id)
    values (true)
    on conflict (id) do update set updated_at = email_settings.updated_at
    returning
      provider,
      enabled,
      resend_api_key as "resendApiKey",
      from_email as "fromEmail",
      from_name as "fromName",
      reply_to_email as "replyToEmail",
      updated_at as "updatedAt"
  `);
  if (!inserted) fail(500, 'email_settings_missing', 'Email settings are not available.');
  return inserted;
}

export async function getEmailSettings() {
  return redactedSettings(await settingsRow());
}

export async function updateEmailSettings(actor: Actor, input: EmailSettingsInput) {
  const hasApiKeyInput = Object.prototype.hasOwnProperty.call(input, 'resendApiKey');
  const hasReplyToInput = Object.prototype.hasOwnProperty.call(input, 'replyToEmail');
  const resendApiKey = hasApiKeyInput ? cleanText(input.resendApiKey || '') : '';
  const fromEmail = input.fromEmail != null ? cleanEmail(input.fromEmail) : null;
  const fromName = input.fromName != null ? cleanText(input.fromName) : null;
  const replyToEmail = hasReplyToInput ? cleanEmail(input.replyToEmail || '') : null;

  if (hasApiKeyInput && resendApiKey && !resendApiKey.startsWith('re_')) {
    fail(400, 'invalid_resend_api_key', 'Resend API key must start with re_.');
  }
  if (fromEmail != null && fromEmail && !validEmail(fromEmail)) {
    fail(400, 'invalid_from_email', 'From email must be valid.');
  }
  if (replyToEmail != null && replyToEmail && !validEmail(replyToEmail)) {
    fail(400, 'invalid_reply_to_email', 'Reply-to email must be valid.');
  }

  const sql = db();
  const row = await one<EmailSettingsRow>(sql`
    update email_settings
    set
      enabled = coalesce(${input.enabled ?? null}, enabled),
      resend_api_key = case when ${hasApiKeyInput} then ${resendApiKey} else resend_api_key end,
      from_email = coalesce(${fromEmail}, from_email),
      from_name = coalesce(${fromName}, from_name),
      reply_to_email = case when ${hasReplyToInput} then nullif(${replyToEmail}, '') else reply_to_email end,
      updated_by = ${actor.id},
      updated_at = now()
    where id = true
    returning
      provider,
      enabled,
      resend_api_key as "resendApiKey",
      from_email as "fromEmail",
      from_name as "fromName",
      reply_to_email as "replyToEmail",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'email_settings_update_failed', 'Could not update email settings.');
  await audit(actor, 'email.settings.update', 'email_settings', 'resend', {
    enabled: input.enabled,
    fromEmail,
    fromName,
    replyToEmail,
    apiKeyChanged: hasApiKeyInput,
  });
  return redactedSettings(row);
}

export async function listEmailTemplates() {
  const sql = db();
  const rows = await sql`
    select
      key,
      name,
      description,
      subject,
      html_body as "htmlBody",
      text_body as "textBody",
      enabled,
      system,
      variables,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from email_templates
    order by system desc, key
  `;
  return rows.map((row: any) => ({ ...row, variables: normalizeVariables(row.variables) }));
}

export async function getEmailTemplate(key: string) {
  const sql = db();
  const row = await one(sql`
    select
      key,
      name,
      description,
      subject,
      html_body as "htmlBody",
      text_body as "textBody",
      enabled,
      system,
      variables,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from email_templates
    where key = ${cleanTemplateKey(key)}
    limit 1
  `);
  if (!row) fail(404, 'email_template_not_found', 'Email template not found.');
  return { ...(row as any), variables: normalizeVariables((row as any).variables) };
}

export async function upsertEmailTemplate(actor: Actor, input: EmailTemplateInput) {
  const key = cleanTemplateKey(input.key);
  const name = cleanText(input.name);
  const subject = cleanText(input.subject);
  const htmlBody = input.htmlBody || '';
  const textBody = input.textBody || '';
  const hasVariablesInput = Object.prototype.hasOwnProperty.call(input, 'variables');
  const variables = hasVariablesInput ? normalizeVariables(input.variables) : [];

  if (!name) fail(400, 'missing_template_name', 'Template name is required.');
  if (!subject) fail(400, 'missing_template_subject', 'Template subject is required.');
  if (!htmlBody && !textBody) fail(400, 'missing_template_body', 'Template HTML or text body is required.');

  const sql = db();
  const row = await one(sql`
    insert into email_templates (
      key, name, description, subject, html_body, text_body, enabled, variables
    ) values (
      ${key},
      ${name},
      ${input.description || ''},
      ${subject},
      ${htmlBody},
      ${textBody},
      ${input.enabled ?? true},
      ${JSON.stringify(variables)}
    )
    on conflict (key) do update set
      name = excluded.name,
      description = excluded.description,
      subject = excluded.subject,
      html_body = excluded.html_body,
      text_body = excluded.text_body,
      enabled = excluded.enabled,
      variables = case when ${hasVariablesInput} then excluded.variables else email_templates.variables end,
      updated_at = now()
    returning
      key,
      name,
      description,
      subject,
      html_body as "htmlBody",
      text_body as "textBody",
      enabled,
      system,
      variables,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'email_template_save_failed', 'Could not save email template.');
  await audit(actor, 'email.template.upsert', 'email_template', key, {
    name,
    enabled: input.enabled ?? true,
    variables: hasVariablesInput ? variables : undefined,
  });
  return { ...(row as any), variables: normalizeVariables((row as any).variables) };
}

async function logSend(
  templateKey: string,
  recipientEmail: string,
  status: 'sent' | 'failed' | 'skipped',
  providerMessageId?: string | null,
  error?: string | null,
) {
  const sql = db();
  await sql`
    insert into email_send_logs (template_key, recipient_email, status, provider_message_id, error)
    values (${templateKey}, ${recipientEmail}, ${status}, ${providerMessageId || null}, ${error || null})
  `;
}

function resendFrom(settings: EmailSettingsRow) {
  return settings.fromName
    ? `${settings.fromName} <${settings.fromEmail}>`
    : settings.fromEmail;
}

function templateDisabled(templateKey: string, recipientEmail: string, code: string, message: string, strict: boolean) {
  return logSend(templateKey, recipientEmail, 'skipped', null, message).then(() => {
    if (strict) fail(409, code, message);
    return { ok: false as const, skipped: code };
  });
}

export async function sendTemplateEmail(
  templateKey: string,
  recipientEmail: string,
  variables: Record<string, unknown> = {},
  options: SendTemplateOptions = {},
) {
  const key = cleanTemplateKey(templateKey);
  const to = cleanEmail(recipientEmail);
  const strict = Boolean(options.strict);
  if (!validEmail(to)) fail(400, 'invalid_recipient_email', 'Recipient email must be valid.');

  const template = await getEmailTemplate(key) as any;
  if (!template.enabled) {
    return await templateDisabled(key, to, 'email_template_disabled', 'Email template is disabled.', strict);
  }

  const settings = await settingsRow();
  if (!settings.enabled) {
    return await templateDisabled(key, to, 'email_provider_disabled', 'Email provider is disabled.', strict);
  }
  if (!settings.resendApiKey) {
    return await templateDisabled(key, to, 'resend_api_key_missing', 'Resend API key is not configured.', strict);
  }
  if (!settings.fromEmail || !validEmail(settings.fromEmail)) {
    return await templateDisabled(key, to, 'email_from_missing', 'From email is not configured.', strict);
  }

  const renderedVariables = {
    appName: 'MANLE',
    ...normalizeVariableMap(variables),
  };
  const subject = renderTemplate(template.subject, renderedVariables);
  const html = template.htmlBody ? renderTemplate(template.htmlBody, renderedVariables, true) : undefined;
  const text = template.textBody ? renderTemplate(template.textBody, renderedVariables) : undefined;
  const payload: Record<string, unknown> = {
    from: resendFrom(settings),
    to: [to],
    subject,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (settings.replyToEmail) payload.reply_to = settings.replyToEmail;

  try {
    const response = await fetch(RESEND_EMAIL_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result?.message || result?.error?.message || 'Resend email request failed.';
      await logSend(key, to, 'failed', null, message);
      if (strict) fail(response.status, 'resend_send_failed', message);
      return { ok: false as const, error: message };
    }
    await logSend(key, to, 'sent', result?.id || null, null);
    return { ok: true as const, id: result?.id || null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend email request failed.';
    await logSend(key, to, 'failed', null, message);
    if (strict) fail(502, 'resend_send_failed', message);
    return { ok: false as const, error: message };
  }
}

export async function sendTemplateEmailQuietly(templateKey: string, recipientEmail: string, variables: Record<string, unknown> = {}) {
  try {
    return await sendTemplateEmail(templateKey, recipientEmail, variables);
  } catch (error) {
    console.error('Email send failed', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Email send failed.' };
  }
}

export async function sendTestEmail(actor: Actor, input: { templateKey?: string; to?: string; variables?: unknown }) {
  const templateKey = cleanTemplateKey(input.templateKey);
  const to = cleanEmail(input.to);
  const variables = normalizeVariableMap(input.variables);
  const result = await sendTemplateEmail(templateKey, to, variables, { strict: true });
  await audit(actor, 'email.test.send', 'email_template', templateKey, { to });
  return result;
}
