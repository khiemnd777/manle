import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { PaddleCredentialStatus, PaddleSettings } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  StatusBadge,
  boolField,
  field,
  messageFromError,
  useFeedbackState,
} from '../adminShared';

function sourceLabel(source: PaddleCredentialStatus['source']) {
  if (source === 'admin') return 'Admin';
  if (source === 'env') return 'Environment';
  return 'None';
}

function credentialSummary(credential: PaddleCredentialStatus) {
  const preview = credential.preview || '—';
  const fallback = credential.source === 'admin' && credential.hasEnvValue ? ' / env fallback available' : '';
  return `${preview} / ${sourceLabel(credential.source)}${fallback}`;
}

function dateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function allConfigured(settings: PaddleSettings | null) {
  return Boolean(settings?.apiKey.hasValue && settings.clientToken.hasValue && settings.webhookSecret.hasValue);
}

export default function PaddleSettingsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const settings = data.paddleSettings;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const apiKey = field(form, 'apiKey');
    const clientToken = field(form, 'clientToken');
    const webhookSecret = field(form, 'webhookSecret');
    const clearApiKey = boolField(form, 'clearApiKey');
    const clearClientToken = boolField(form, 'clearClientToken');
    const clearWebhookSecret = boolField(form, 'clearWebhookSecret');

    if (!apiKey && !clientToken && !webhookSecret && !clearApiKey && !clearClientToken && !clearWebhookSecret) {
      setError('Enter a new Paddle credential or select a stored credential to clear.');
      return;
    }
    if ((clearApiKey || clearClientToken || clearWebhookSecret) && !window.confirm('Clear selected admin-stored Paddle credential(s)?')) return;

    try {
      const body: Parameters<typeof api.updatePaddleSettings>[0] = {};
      if (apiKey && !clearApiKey) body.apiKey = apiKey;
      if (clientToken && !clearClientToken) body.clientToken = clientToken;
      if (webhookSecret && !clearWebhookSecret) body.webhookSecret = webhookSecret;
      if (clearApiKey) body.clearApiKey = true;
      if (clearClientToken) body.clearClientToken = true;
      if (clearWebhookSecret) body.clearWebhookSecret = true;
      await api.updatePaddleSettings(body);
      setMessage('Paddle settings saved.');
      form.reset();
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="settings-grid">
      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>Paddle Credentials</h2>
          <StatusBadge value={allConfigured(settings)} />
        </div>
        {settings ? (
          <>
            <dl className="profile-facts">
              <div>
                <dt>API key</dt>
                <dd>{credentialSummary(settings.apiKey)}</dd>
              </div>
              <div>
                <dt>Client token</dt>
                <dd>{credentialSummary(settings.clientToken)}</dd>
              </div>
              <div>
                <dt>Webhook secret</dt>
                <dd>{credentialSummary(settings.webhookSecret)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{dateTime(settings.updatedAt)}</dd>
              </div>
            </dl>
            {message && <div className="success-box compact">{message}</div>}
            {error && <div className="error-box compact">{error}</div>}
            <form key={`${settings.updatedAt}:${settings.apiKey.preview || 'none'}:${settings.clientToken.preview || 'none'}:${settings.webhookSecret.preview || 'none'}`} className="stack-form" onSubmit={saveSettings}>
              <label>Paddle API key<input name="apiKey" type="password" placeholder={settings.apiKey.hasValue ? `Keep current API key (${settings.apiKey.preview})` : 'Paddle API key'} autoComplete="off" /></label>
              <label>Client-side token<input name="clientToken" type="password" placeholder={settings.clientToken.hasValue ? `Keep current token (${settings.clientToken.preview})` : 'test_... or live_...'} autoComplete="off" /></label>
              <label>Webhook secret<input name="webhookSecret" type="password" placeholder={settings.webhookSecret.hasValue ? `Keep current secret (${settings.webhookSecret.preview})` : 'Webhook endpoint secret'} autoComplete="off" /></label>
              <label className="check"><input name="clearApiKey" type="checkbox" disabled={!settings.apiKey.hasStoredValue} /> Clear admin-stored API key</label>
              <label className="check"><input name="clearClientToken" type="checkbox" disabled={!settings.clientToken.hasStoredValue} /> Clear admin-stored client token</label>
              <label className="check"><input name="clearWebhookSecret" type="checkbox" disabled={!settings.webhookSecret.hasStoredValue} /> Clear admin-stored webhook secret</label>
              <div className="form-actions">
                <ActionButton type="submit" icon="save">Save settings</ActionButton>
              </div>
            </form>
          </>
        ) : (
          <div className="empty">Paddle settings are not loaded.</div>
        )}
      </div>
    </section>
  );
}
