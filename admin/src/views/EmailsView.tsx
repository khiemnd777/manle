import { Suspense, lazy, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { EmailTemplate, EmailVariable } from '../api/client';
import type { AdminData } from '../adminTypes';
import { htmlToText } from '../emailText';
import {
  ActionButton,
  Dialog,
  StatusBadge,
  boolField,
  dateOnly,
  field,
  messageFromError,
  useFeedbackState,
} from '../adminShared';

const RichTextEditor = lazy(() => import('../RichTextEditor'));

function cleanVariableText(value: string) {
  return value.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
}

function variableToken(value: string) {
  const text = cleanVariableText(value);
  return text ? `{{${text}}}` : '';
}

function normalizeEmailVariables(value: unknown): EmailVariable[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const variables: EmailVariable[] = [];
  for (const item of value) {
    const text = typeof item === 'string'
      ? cleanVariableText(item)
      : cleanVariableText(String((item as EmailVariable)?.text || (item as EmailVariable)?.label || ''));
    if (!text || seen.has(text)) continue;
    seen.add(text);
    variables.push({ text, label: variableToken(text) });
  }
  return variables;
}

function testVariableValues(form: HTMLFormElement, variables: EmailVariable[]) {
  return Object.fromEntries(variables.map(variable => [variable.text, field(form, `var:${variable.text}`)]));
}

function RichTextEditorFallback({ name, initialHtml }: { name: string; initialHtml: string }) {
  return (
    <div className="rich-editor is-loading" aria-busy="true">
      <input type="hidden" name={name} value={initialHtml} readOnly />
      <input type="hidden" name="textBody" value={htmlToText(initialHtml)} readOnly />
      <div className="empty">Loading editor...</div>
    </div>
  );
}

function EmailTemplateFields({ template }: { template?: EmailTemplate }) {
  const variables = normalizeEmailVariables(template?.variables || []);
  const initialHtml = template?.htmlBody || '<p></p>';

  return (
    <>
      <VariablesList variables={variables} />
      <div className="field-label">Email body</div>
      <Suspense fallback={<RichTextEditorFallback name="htmlBody" initialHtml={initialHtml} />}>
        <RichTextEditor name="htmlBody" initialHtml={initialHtml} variables={variables} />
      </Suspense>
    </>
  );
}

function VariablesList({ variables }: { variables: EmailVariable[] }) {
  const normalized = normalizeEmailVariables(variables);
  return (
    <div className="variable-list">
      <strong>Variables</strong>
      {normalized.length ? (
        <div className="variable-pills static">
          {normalized.map(variable => <span key={variable.text}>{variable.label}</span>)}
        </div>
      ) : (
        <span className="muted">—</span>
      )}
    </div>
  );
}

function TestVariablesEditor({ variables }: { variables: EmailVariable[] }) {
  const normalized = normalizeEmailVariables(variables);
  if (!normalized.length) return <div className="empty">This template does not declare variables.</div>;
  return (
    <div className="test-variable-grid">
      {normalized.map(variable => (
        <label key={variable.text}>{variable.label}<input name={`var:${variable.text}`} placeholder={`{{${variable.text}}}`} /></label>
      ))}
    </div>
  );
}

export default function EmailsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [testing, setTesting] = useState<EmailTemplate | null>(null);
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const settings = data.emailSettings;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const resendApiKey = field(form, 'resendApiKey');
    const body: Parameters<typeof api.updateEmailSettings>[0] = {
      enabled: boolField(form, 'enabled'),
      fromName: field(form, 'fromName'),
      fromEmail: field(form, 'fromEmail'),
      replyToEmail: field(form, 'replyToEmail') || null,
    };
    if (resendApiKey) body.resendApiKey = resendApiKey;
    if (boolField(form, 'clearResendApiKey')) body.resendApiKey = '';

    try {
      await api.updateEmailSettings(body);
      setMessage('Email settings saved.');
      form.reset();
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  function templatePayload(form: HTMLFormElement, key?: string): Partial<EmailTemplate> {
    return {
      key: key || field(form, 'key'),
      name: field(form, 'name'),
      description: field(form, 'description'),
      subject: field(form, 'subject'),
      htmlBody: field(form, 'htmlBody'),
      textBody: field(form, 'textBody') || htmlToText(field(form, 'htmlBody')),
      enabled: boolField(form, 'enabled'),
    };
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.createEmailTemplate(templatePayload(event.currentTarget));
      setCreateOpen(false);
      setMessage('Email template created.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function openEdit(template: EmailTemplate) {
    setError('');
    setMessage('');
    try {
      const result = await api.emailTemplate(template.key);
      setEditing(result.template);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError('');
    setMessage('');
    try {
      await api.updateEmailTemplate(editing.key, templatePayload(event.currentTarget, editing.key));
      setEditing(null);
      setMessage('Email template saved.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function deleteTemplate(template: EmailTemplate) {
    if (!window.confirm(`Delete email template ${template.key}? This cannot be undone.`)) return;
    setError('');
    setMessage('');
    try {
      await api.deleteEmailTemplate(template.key);
      if (editing?.key === template.key) setEditing(null);
      if (testing?.key === template.key) setTesting(null);
      setMessage('Email template deleted.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testing) return;
    setError('');
    setMessage('');
    try {
      const result = await api.sendTestEmail({
        templateKey: testing.key,
        to: field(event.currentTarget, 'to'),
        variables: testVariableValues(event.currentTarget, testing.variables),
      });
      setTesting(null);
      setMessage(result.id ? `Test email sent: ${result.id}` : 'Test email sent.');
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="email-grid">
      <div className="panel">
        <div className="panel-head">
          <h2>Resend Settings</h2>
          <StatusBadge value={settings?.enabled || false} />
        </div>
        {settings ? (
          <form key={`${settings.updatedAt}:${settings.resendApiKeyPreview || 'none'}`} className="stack-form" onSubmit={saveSettings}>
            <label className="check"><input name="enabled" type="checkbox" defaultChecked={settings.enabled} /> Enable email sending</label>
            <label>From name<input name="fromName" defaultValue={settings.fromName || 'MANLE'} /></label>
            <label>From email<input name="fromEmail" type="email" defaultValue={settings.fromEmail || ''} placeholder="hello@manle.info" /></label>
            <label>Reply-to email<input name="replyToEmail" type="email" defaultValue={settings.replyToEmail || ''} placeholder="Optional" /></label>
            <label>Resend API key<input name="resendApiKey" type="password" placeholder={settings.hasResendApiKey ? `Keep current key (${settings.resendApiKeyPreview})` : 're_...'} autoComplete="off" /></label>
            <label className="check"><input name="clearResendApiKey" type="checkbox" /> Clear stored API key</label>
            <div className="form-actions">
              <ActionButton type="submit" icon="save">Save settings</ActionButton>
            </div>
          </form>
        ) : (
          <div className="empty">Email settings are not loaded.</div>
        )}
      </div>
      <div className="panel email-template-panel">
        <div className="panel-head">
          <h2>Email Templates</h2>
          <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create template</ActionButton>
        </div>
        {error && <div className="error-box compact">{error}</div>}
        <table>
          <thead><tr><th>Template</th><th>Subject</th><th>Variables</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.emailTemplates.map(template => (
              <tr key={template.key}>
                <td><strong>{template.name}</strong><br /><span className="muted">{template.key}{template.system ? ' / system' : ''}</span></td>
                <td>{template.subject}<br /><span className="muted">{template.description}</span></td>
                <td>{template.variables?.length ? template.variables.map(variable => variable.label || variableToken(variable.text)).join(', ') : '—'}</td>
                <td><StatusBadge value={template.enabled} /></td>
                <td className="button-cell">
                  <ActionButton type="button" icon="edit" onClick={() => openEdit(template)}>Edit</ActionButton>
                  <ActionButton type="button" icon="mail" className="ghost-button" onClick={() => setTesting(template)}>Test</ActionButton>
                  {template.system ? (
                    <ActionButton type="button" icon="trash" className="ghost-button" disabled title="System template cannot be deleted">Delete</ActionButton>
                  ) : (
                    <ActionButton type="button" icon="trash" className="danger-button" onClick={() => deleteTemplate(template)}>Delete</ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <Dialog title="Create email template" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={createTemplate}>
            <label>Key<input name="key" placeholder="custom_notice" required /></label>
            <label>Name<input name="name" placeholder="Template name" required /></label>
            <label>Description<input name="description" placeholder="Internal description" /></label>
            <label>Subject<input name="subject" placeholder="Email subject" required /></label>
            <EmailTemplateFields />
            <label className="check"><input name="enabled" type="checkbox" defaultChecked /> Enabled</label>
            <div className="dialog-actions">
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create template</ActionButton>
            </div>
          </form>
        </Dialog>
      )}

      {editing && (
        <Dialog title="Edit email template" onClose={() => setEditing(null)}>
          <form className="dialog-form" onSubmit={saveTemplate}>
            <div className="dialog-context">
              <strong>{editing.name}</strong>
              <span>{editing.key}{editing.system ? ' / system template' : ''}</span>
              <span>Updated {dateOnly(editing.updatedAt)}</span>
            </div>
            <label>Name<input name="name" defaultValue={editing.name} required /></label>
            <label>Description<input name="description" defaultValue={editing.description} /></label>
            <label>Subject<input name="subject" defaultValue={editing.subject} required /></label>
            <EmailTemplateFields template={editing} />
            <label className="check"><input name="enabled" type="checkbox" defaultChecked={editing.enabled} /> Enabled</label>
            <div className="dialog-actions">
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setEditing(null)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="save">Save template</ActionButton>
            </div>
          </form>
        </Dialog>
      )}

      {testing && (
        <Dialog title="Send test email" onClose={() => setTesting(null)}>
          <form className="dialog-form" onSubmit={sendTest}>
            <div className="dialog-context">
              <strong>{testing.name}</strong>
              <span>{testing.subject}</span>
            </div>
            <label>Recipient<input name="to" type="email" placeholder="recipient@example.com" required /></label>
            <TestVariablesEditor variables={testing.variables} />
            <div className="dialog-actions">
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setTesting(null)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="mail">Send test</ActionButton>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
