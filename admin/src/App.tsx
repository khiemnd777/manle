import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Actor,
  ApiError,
  AuditLog,
  Customer,
  EmailSettings,
  EmailTemplate,
  EmailVariable,
  EntitlementDefinition,
  EntitlementGrant,
  PriceTier,
  Promotion,
  Subscription,
  SystemUser,
  api,
} from './api/client';
import { htmlToText } from './emailText';

type View = 'users' | 'customers' | 'subscriptions' | 'promotions' | 'tiers' | 'entitlements' | 'emails' | 'audit' | 'profile';

type AdminData = {
  overview: { systemUsers: number; customers: number; activeSubscriptions: number; activePromotions: number; activeTiers: number };
  systemUsers: SystemUser[];
  customers: Customer[];
  subscriptions: Subscription[];
  promotions: Promotion[];
  tiers: PriceTier[];
  entitlementDefinitions: EntitlementDefinition[];
  entitlementGrants: EntitlementGrant[];
  emailSettings: EmailSettings | null;
  emailTemplates: EmailTemplate[];
  auditLogs: AuditLog[];
};

type SelectOption = {
  value: string;
  label: string;
};

const RichTextEditor = lazy(() => import('./RichTextEditor'));

const emptyData: AdminData = {
  overview: { systemUsers: 0, customers: 0, activeSubscriptions: 0, activePromotions: 0, activeTiers: 0 },
  systemUsers: [],
  customers: [],
  subscriptions: [],
  promotions: [],
  tiers: [],
  entitlementDefinitions: [],
  entitlementGrants: [],
  emailSettings: null,
  emailTemplates: [],
  auditLogs: [],
};

function messageFromError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

function field(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(form: HTMLFormElement, name: string) {
  const value = Number(field(form, name));
  return Number.isFinite(value) ? value : 0;
}

function boolField(form: HTMLFormElement, name: string) {
  return new FormData(form).get(name) === 'on';
}

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

function cents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function dateOnly(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function StatusBadge({ value }: { value?: string | boolean | null }) {
  const text = value == null ? 'none' : String(value);
  const kind = text === 'active' || text === 'true' || text === 'trialing' ? 'good' : text === 'disabled' || text === 'false' ? 'bad' : 'neutral';
  return <span className={`status status-${kind}`}>{text}</span>;
}

const customerStatusOptions: SelectOption[] = [
  { value: 'active', label: 'active' },
  { value: 'disabled', label: 'disabled' },
];

const systemRoleOptions: SelectOption[] = [
  { value: 'user', label: 'normal user' },
  { value: 'admin', label: 'admin' },
];

const subscriptionStatusOptions: SelectOption[] = [
  { value: 'active', label: 'active' },
  { value: 'trialing', label: 'trialing' },
  { value: 'past_due', label: 'past_due' },
  { value: 'canceled', label: 'canceled' },
];

const discountTypeOptions: SelectOption[] = [
  { value: 'percent', label: 'percent' },
  { value: 'amount', label: 'amount' },
  { value: 'trial', label: 'trial' },
  { value: 'custom', label: 'custom' },
];

function tierOptions(tiers: PriceTier[], first?: SelectOption) {
  const options = tiers.map(tier => ({ value: tier.code, label: tier.name }));
  return first ? [first, ...options] : options;
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function CustomSelect({
  name,
  options,
  defaultValue = '',
  placeholder = 'Select',
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const selected = options.find(option => option.value === value);

  return (
    <div
      className={`custom-select${open ? ' open' : ''}`}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (nextFocus && event.currentTarget.contains(nextFocus)) return;
        setOpen(false);
      }}
    >
      <input type="hidden" name={name} value={value} readOnly />
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <span className="select-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'selected' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Switcher({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean, input: HTMLInputElement) => void;
}) {
  return (
    <label className="switcher" aria-label={label}>
      <input
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked, event.currentTarget)}
      />
      <span className="switch-track" aria-hidden="true"><span /></span>
    </label>
  );
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

export function App() {
  const [loading, setLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const status = await api.bootstrapStatus();
        if (!mounted) return;
        setHasAdmin(status.hasAdmin);
        if (status.hasAdmin) {
          try {
            const me = await api.me();
            if (mounted) setActor(me.actor);
          } catch {
            if (mounted) setActor(null);
          }
        }
      } catch (err) {
        if (mounted) setError(messageFromError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <ScreenFrame title="MANLE Admin"><div className="loading">Loading admin console...</div></ScreenFrame>;
  if (error) return <ScreenFrame title="MANLE Admin"><div className="error-box">{error}</div></ScreenFrame>;
  if (!hasAdmin) return <InitialSetup onDone={() => setHasAdmin(true)} />;
  if (!actor) return <Login onLogin={setActor} />;
  return <AdminShell actor={actor} onActorChange={setActor} onLogout={() => setActor(null)} />;
}

function ScreenFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="screen-frame">
      <section className="auth-panel">
        <div className="brand-row">
          <span className="brand-mark">M</span>
          <div>
            <h1>{title}</h1>
            <p>Admin operations for users, billing, tiers, and entitlements.</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

function InitialSetup({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    try {
      await api.bootstrap({
        name: field(form, 'name'),
        email: field(form, 'email'),
        password: field(form, 'password'),
      });
      setDone(true);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <ScreenFrame title="Initial Admin Setup">
      {done ? (
        <div className="success-box">
          Admin account created. Sign in with the email and password you just set.
          <button type="button" onClick={onDone}>Continue to login</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>Name<input name="name" placeholder="MANLE Admin" required /></label>
          <label>Email<input name="email" type="email" placeholder="admin@manle.info" required /></label>
          <label>Password<input name="password" type="password" minLength={10} required /></label>
          {error && <div className="error-box">{error}</div>}
          <button type="submit">Create initial admin</button>
        </form>
      )}
    </ScreenFrame>
  );
}

function Login({ onLogin }: { onLogin: (actor: Actor) => void }) {
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    try {
      const result = await api.login({ email: field(form, 'email'), password: field(form, 'password') });
      onLogin(result.actor);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <ScreenFrame title="MANLE Admin Login">
      <form className="auth-form" onSubmit={submit}>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <div className="error-box">{error}</div>}
        <button type="submit">Sign in</button>
      </form>
    </ScreenFrame>
  );
}

function AdminShell({
  actor,
  onActorChange,
  onLogout,
}: {
  actor: Actor;
  onActorChange: (actor: Actor) => void;
  onLogout: () => void;
}) {
  const isAdmin = actor.role === 'admin';
  const [view, setView] = useState<View>(isAdmin ? 'users' : 'profile');
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const viewTitle = view === 'profile' ? 'Profile' : view === 'users' ? 'System Users' : view === 'emails' ? 'Email Templates' : view;
  const viewDescription = !isAdmin || view === 'profile'
    ? 'Manage your account identity and password.'
    : view === 'users'
      ? 'Manage internal MANLE admin and normal user accounts.'
      : view === 'emails'
        ? 'Manage Resend delivery settings, reusable templates, and test sends.'
        : 'Manage MANLE customers, billing state, price tiers, promotions, and feature access.';

  async function loadAll(customerSearch = '', systemUserSearch = '') {
    setLoading(true);
    setError('');
    if (!isAdmin) {
      setData(emptyData);
      setLoading(false);
      return;
    }
    try {
      const [overview, systemUsers, customers, subscriptions, promotions, tiers, entitlements, emailSettings, emailTemplates, audit] = await Promise.all([
        api.overview(),
        api.systemUsers(systemUserSearch),
        api.customers(customerSearch),
        api.subscriptions(),
        api.promotions(),
        api.priceTiers(),
        api.entitlements(),
        api.emailSettings(),
        api.emailTemplates(),
        api.audit(),
      ]);
      setData({
        overview,
        systemUsers: systemUsers.users,
        customers: customers.customers,
        subscriptions: subscriptions.subscriptions,
        promotions: promotions.promotions,
        tiers: tiers.tiers,
        entitlementDefinitions: entitlements.definitions,
        entitlementGrants: entitlements.grants,
        emailSettings: emailSettings.settings,
        emailTemplates: emailTemplates.templates,
        auditLogs: audit.logs,
      });
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [actor.role]);

  useEffect(() => {
    if (!isAdmin && view !== 'profile') setView('profile');
  }, [isAdmin, view]);

  async function logout() {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="side-brand"><span className="brand-mark">M</span><strong>MANLE Admin</strong></div>
        {isAdmin && (['users', 'customers', 'subscriptions', 'promotions', 'tiers', 'entitlements', 'emails', 'audit'] as View[]).map(item => (
          <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
            {item === 'users' ? 'users' : item}
          </button>
        ))}
        <div className="side-footer">
          <button
            type="button"
            className={`profile-link${view === 'profile' ? ' active' : ''}`}
            onClick={() => setView('profile')}
            aria-current={view === 'profile' ? 'page' : undefined}
          >
            {actor.email}
          </button>
          <button type="button" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="topbar">
          <div>
            <h1>{viewTitle}</h1>
            <p>{viewDescription}</p>
          </div>
          {isAdmin && <button type="button" onClick={() => loadAll()}>Refresh</button>}
        </header>
        {isAdmin && (
          <section className="metric-grid">
            <Metric label="System users" value={data.overview.systemUsers} />
            <Metric label="Customers" value={data.overview.customers} />
            <Metric label="Active subscriptions" value={data.overview.activeSubscriptions} />
            <Metric label="Active promotions" value={data.overview.activePromotions} />
            <Metric label="Active tiers" value={data.overview.activeTiers} />
          </section>
        )}
        {error && <div className="error-box">{error}</div>}
        {loading ? <div className="loading">Loading data...</div> : (
          <>
            {view === 'users' && isAdmin && <SystemUsersView actor={actor} data={data} reload={loadAll} />}
            {view === 'customers' && <CustomersView data={data} reload={loadAll} />}
            {view === 'subscriptions' && <SubscriptionsView data={data} reload={loadAll} />}
            {view === 'promotions' && <PromotionsView data={data} reload={loadAll} />}
            {view === 'tiers' && <TiersView data={data} reload={loadAll} />}
            {view === 'entitlements' && <EntitlementsView data={data} reload={loadAll} />}
            {view === 'emails' && <EmailsView data={data} reload={loadAll} />}
            {view === 'audit' && <AuditView logs={data.auditLogs} />}
            {view === 'profile' && <ProfileView actor={actor} onActorChange={onActorChange} />}
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function SystemUsersView({
  actor,
  data,
  reload,
}: {
  actor: Actor;
  data: AdminData;
  reload: (customerSearch?: string, systemUserSearch?: string) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = field(event.currentTarget, 'search');
    setSearch(nextSearch);
    await reload('', nextSearch);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const password = field(form, 'password');
    if (password !== field(form, 'confirmPassword')) {
      setError('Password and confirmation do not match.');
      return;
    }
    try {
      await api.createSystemUser({
        name: field(form, 'name'),
        email: field(form, 'email'),
        role: field(form, 'role') as SystemUser['role'],
        status: field(form, 'status') as SystemUser['status'],
        password,
      });
      setCreateOpen(false);
      setMessage('System user created.');
      await reload('', search);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function openEdit(user: SystemUser) {
    setError('');
    setMessage('');
    try {
      const result = await api.systemUser(user.id);
      setEditing(result.user);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const password = field(form, 'password');
    const confirmPassword = field(form, 'confirmPassword');
    if (password && password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }
    try {
      await api.updateSystemUser(editing.id, {
        name: field(form, 'name'),
        email: field(form, 'email'),
        role: field(form, 'role') as SystemUser['role'],
        status: field(form, 'status') as SystemUser['status'],
        password: password || undefined,
      });
      setEditing(null);
      setMessage('System user saved.');
      await reload('', search);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>System Users</h2>
        <div className="toolbar-row">
          <form className="inline-form" onSubmit={runSearch}>
            <input name="search" placeholder="Search name or email" defaultValue={search} />
            <button type="submit">Search</button>
          </form>
          <button type="button" onClick={() => setCreateOpen(true)}>Create user</button>
        </div>
      </div>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {data.systemUsers.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role === 'user' ? 'normal user' : user.role}</td>
              <td><StatusBadge value={user.status} /></td>
              <td>{dateOnly(user.createdAt)}</td>
              <td><button type="button" onClick={() => openEdit(user)}>{user.id === actor.id ? 'View' : 'Edit'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {createOpen && (
        <Dialog title="Create system user" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={create}>
            <label>Name<input name="name" placeholder="User name" required /></label>
            <label>Email<input name="email" type="email" placeholder="user@manle.info" required /></label>
            <label>Role<CustomSelect name="role" defaultValue="user" options={systemRoleOptions} /></label>
            <label>Status<CustomSelect name="status" defaultValue="active" options={customerStatusOptions} /></label>
            <label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
            <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit">Create user</button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog title="System user details" onClose={() => setEditing(null)}>
          <form className="dialog-form" onSubmit={save}>
            <div className="dialog-context">
              <strong>{editing.name}</strong>
              <span>{editing.email}</span>
              <code>{editing.id}</code>
              <span>Created {dateOnly(editing.createdAt)} / Updated {dateOnly(editing.updatedAt)}</span>
            </div>
            <label>Name<input name="name" defaultValue={editing.name} required /></label>
            <label>Email<input name="email" type="email" defaultValue={editing.email} required /></label>
            <label>Role<CustomSelect name="role" defaultValue={editing.role} options={systemRoleOptions} /></label>
            <label>Status<CustomSelect name="status" defaultValue={editing.status} options={customerStatusOptions} /></label>
            <label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} /></label>
            <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} /></label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit">Save user</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function ProfileView({ actor, onActorChange }: { actor: Actor; onActorChange: (actor: Actor) => void }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      const result = await api.updateProfile({
        name: field(form, 'name'),
        email: field(form, 'email'),
        currentPassword: field(form, 'currentPassword') || undefined,
      });
      onActorChange(result.actor);
      const currentPassword = form.elements.namedItem('currentPassword') as HTMLInputElement | null;
      if (currentPassword) currentPassword.value = '';
      setMessage('Profile saved.');
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const newPassword = field(form, 'newPassword');
    const confirmPassword = field(form, 'confirmPassword');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    try {
      const result = await api.updateProfile({
        name: actor.name,
        email: actor.email,
        currentPassword: field(form, 'currentPassword'),
        newPassword,
      });
      onActorChange(result.actor);
      form.reset();
      setMessage('Password saved.');
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="profile-grid">
      <div className="panel profile-summary-panel">
        <div className="panel-head">
          <h2>Account</h2>
          <StatusBadge value={actor.status} />
        </div>
        <div className="profile-identity">
          <span className="brand-mark">{(actor.name || actor.email || 'A').slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{actor.name}</strong>
            <span>{actor.email}</span>
          </div>
        </div>
        <dl className="profile-facts">
          <div><dt>Role</dt><dd>{actor.role}</dd></div>
          <div><dt>Status</dt><dd>{actor.status}</dd></div>
          <div><dt>User ID</dt><dd><code>{actor.id}</code></dd></div>
        </dl>
      </div>
      <div className="profile-forms">
        {message && <div className="success-box compact">{message}</div>}
        {error && <div className="error-box compact">{error}</div>}
        <section className="panel">
          <div className="panel-head">
            <h2>Account Details</h2>
          </div>
          <form key={`${actor.id}:${actor.email}:${actor.name}`} className="stack-form" onSubmit={saveAccount}>
            <label>Name<input name="name" defaultValue={actor.name} autoComplete="name" required /></label>
            <label>Email<input name="email" type="email" defaultValue={actor.email} autoComplete="email" required /></label>
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" /></label>
            <div className="form-actions">
              <button type="submit">Save profile</button>
            </div>
          </form>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Password</h2>
          </div>
          <form className="stack-form" onSubmit={savePassword}>
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <div className="form-actions">
              <button type="submit">Change password</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}

function CustomersView({ data, reload }: { data: AdminData; reload: (search?: string) => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [entitlements, setEntitlements] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const defaultTier = data.tiers.find(tier => tier.code === 'free')?.code || data.tiers[0]?.code || '';

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      await api.createCustomer({
        name: field(form, 'name'),
        email: field(form, 'email'),
        currentTierCode: field(form, 'tier'),
        status: 'active',
      });
      setCreateOpen(false);
      setMessage('Customer created.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      await api.updateCustomer(editing.id, {
        name: field(form, 'name'),
        email: field(form, 'email'),
        status: field(form, 'status') as Customer['status'],
        currentTierCode: field(form, 'tier'),
        paddleCustomerId: field(form, 'paddleCustomerId'),
        notes: field(form, 'notes'),
      });
      setEditing(null);
      setEntitlements(null);
      setMessage('Customer saved.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function openEdit(customer: Customer) {
    setError('');
    setMessage('');
    setEditing(customer);
    setEntitlements(null);
    try {
      const result = await api.customerEntitlements(customer.id);
      setEntitlements(result.entitlements);
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Customers</h2>
        <div className="toolbar-row">
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); reload(field(event.currentTarget, 'search')); }}>
            <input name="search" placeholder="Search name or email" />
            <button type="submit">Search</button>
          </form>
          <button type="button" onClick={() => setCreateOpen(true)}>Create customer</button>
        </div>
      </div>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Subscription</th><th>Exports</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {data.customers.map(customer => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>{customer.email}</td>
              <td>{customer.subscriptionTier || customer.currentTierCode}</td>
              <td><StatusBadge value={customer.subscriptionStatus || 'none'} /></td>
              <td>{customer.exportsToday || 0}</td>
              <td><StatusBadge value={customer.status} /></td>
              <td><button type="button" onClick={() => openEdit(customer)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {createOpen && (
        <Dialog title="Create customer" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={create}>
            <label>Name<input name="name" placeholder="Customer name" required /></label>
            <label>Email<input name="email" type="email" placeholder="customer@email.com" required /></label>
            <label>Tier<CustomSelect name="tier" defaultValue={defaultTier} options={tierOptions(data.tiers)} placeholder="Tier" /></label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit">Create customer</button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit customer" onClose={() => { setEditing(null); setEntitlements(null); }}>
          <form className="dialog-form" onSubmit={save}>
            <label>Name<input name="name" defaultValue={editing.name} /></label>
            <label>Email<input name="email" type="email" defaultValue={editing.email} /></label>
            <label>Status<CustomSelect name="status" defaultValue={editing.status} options={customerStatusOptions} /></label>
            <label>Tier<CustomSelect name="tier" defaultValue={editing.currentTierCode} options={tierOptions(data.tiers)} placeholder="Tier" /></label>
            <label>Paddle customer ID<input name="paddleCustomerId" defaultValue={editing.paddleCustomerId || ''} /></label>
            <label>Notes<textarea name="notes" defaultValue={editing.notes || ''} /></label>
            <div className="entitlement-list">
              <strong>Effective entitlements</strong>
              {entitlements ? Object.entries(entitlements).map(([key, value]) => (
                <div key={key}><span>{key}</span><code>{String(value)}</code></div>
              )) : <span className="muted">Loading...</span>}
            </div>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => { setEditing(null); setEntitlements(null); }}>Cancel</button>
              <button type="submit">Save customer</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function SubscriptionsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const defaultTier = data.tiers.find(tier => tier.code === 'basic')?.code || data.tiers[0]?.code || '';
  const customerOptions = [
    { value: '', label: 'Customer' },
    ...data.customers.map(customer => ({ value: customer.id, label: `${customer.name} - ${customer.email}` })),
  ];

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      await api.createSubscription({
        userId: field(form, 'userId'),
        tierCode: field(form, 'tierCode'),
        status: field(form, 'status'),
        paddleCustomerId: field(form, 'paddleCustomerId'),
        paddleSubscriptionId: field(form, 'paddleSubscriptionId'),
        manualOverride: true,
      });
      setCreateOpen(false);
      setMessage('Subscription created.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      await api.updateSubscription(id, {
        status: field(form, 'status'),
        tierCode: field(form, 'tierCode'),
        paddleCustomerId: field(form, 'paddleCustomerId'),
        paddleSubscriptionId: field(form, 'paddleSubscriptionId'),
        cancelAtPeriodEnd: boolField(form, 'cancelAtPeriodEnd'),
        manualOverride: boolField(form, 'manualOverride'),
      });
      setEditing(null);
      setMessage('Subscription saved.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function syncPaddle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSyncMessage('');
    setSyncError('');
    const form = event.currentTarget;
    try {
      const result = await api.syncPaddle({
        subscriptionId: field(form, 'syncSubscriptionId'),
        customerId: field(form, 'syncCustomerId'),
      });
      form.reset();
      setSyncMessage(result.subscriptionId
        ? `Synced subscription ${result.subscriptionId}.`
        : `Synced ${result.subscriptions || 0} subscription(s) for customer ${result.customerId}.`);
      await reload();
    } catch (err) {
      setSyncError(messageFromError(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Subscriptions</h2>
        <button type="button" onClick={() => setCreateOpen(true)}>Create subscription</button>
      </div>
      <form className="inline-form sync-row" onSubmit={syncPaddle}>
        <input name="syncSubscriptionId" placeholder="Paddle subscription ID" />
        <input name="syncCustomerId" placeholder="or Paddle customer ID" />
        <button type="submit">Sync Paddle</button>
      </form>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
      {syncMessage && <div className="success-box compact">{syncMessage}</div>}
      {syncError && <div className="error-box compact">{syncError}</div>}
      <table>
        <thead><tr><th>Customer</th><th>Status</th><th>Tier</th><th>Paddle subscription</th><th>Period end</th><th>Flags</th><th></th></tr></thead>
        <tbody>
          {data.subscriptions.map(sub => (
            <tr key={sub.id}>
              <td>{sub.customerName}<br /><span className="muted">{sub.customerEmail}</span></td>
              <td><StatusBadge value={sub.status} /></td>
              <td>{sub.tierCode}</td>
              <td>{sub.paddleSubscriptionId || '—'}</td>
              <td>{dateOnly(sub.currentPeriodEnd)}</td>
              <td>{sub.cancelAtPeriodEnd ? 'canceling ' : ''}{sub.manualOverride ? 'manual' : 'Paddle'}</td>
              <td><button type="button" onClick={() => setEditing(sub)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {createOpen && (
        <Dialog title="Create subscription" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={create}>
            <label>Customer<CustomSelect name="userId" defaultValue="" options={customerOptions} /></label>
            <label>Tier<CustomSelect name="tierCode" defaultValue={defaultTier} options={tierOptions(data.tiers)} placeholder="Tier" /></label>
            <label>Status<CustomSelect name="status" defaultValue="active" options={subscriptionStatusOptions} /></label>
            <label>Paddle customer ID<input name="paddleCustomerId" placeholder="Paddle customer ID" /></label>
            <label>Paddle subscription ID<input name="paddleSubscriptionId" placeholder="Paddle subscription ID" /></label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit">Create subscription</button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit subscription" onClose={() => setEditing(null)}>
          <form className="dialog-form" onSubmit={(event) => save(event, editing.id)}>
            <label>Status<CustomSelect name="status" defaultValue={editing.status} options={subscriptionStatusOptions} /></label>
            <label>Tier<CustomSelect name="tierCode" defaultValue={editing.tierCode} options={tierOptions(data.tiers)} placeholder="Tier" /></label>
            <label>Paddle customer ID<input name="paddleCustomerId" defaultValue={editing.paddleCustomerId || ''} /></label>
            <label>Paddle subscription ID<input name="paddleSubscriptionId" defaultValue={editing.paddleSubscriptionId || ''} /></label>
            <label className="check"><input name="cancelAtPeriodEnd" type="checkbox" defaultChecked={editing.cancelAtPeriodEnd} /> Cancel at period end</label>
            <label className="check"><input name="manualOverride" type="checkbox" defaultChecked={editing.manualOverride} /> Manual override</label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit">Save subscription</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function PromotionsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const anyTierOptions = tierOptions(data.tiers, { value: '', label: 'Any tier' });

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      await api.createPromotion({
        code: field(form, 'code'),
        name: field(form, 'name'),
        description: field(form, 'description'),
        tierCode: field(form, 'tierCode') || null,
        discountType: field(form, 'discountType') as Promotion['discountType'],
        discountValue: numberField(form, 'discountValue'),
        maxRedemptions: numberField(form, 'maxRedemptions') || null,
        paddleDiscountId: field(form, 'paddleDiscountId') || null,
        active: boolField(form, 'active'),
      });
      setCreateOpen(false);
      setMessage('Promotion created.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>, promo: Promotion) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      await api.updatePromotion(promo.id, {
        name: field(form, 'name'),
        description: field(form, 'description'),
        tierCode: field(form, 'tierCode') || null,
        discountType: field(form, 'discountType') as Promotion['discountType'],
        discountValue: numberField(form, 'discountValue'),
        maxRedemptions: numberField(form, 'maxRedemptions') || null,
        paddleDiscountId: field(form, 'paddleDiscountId') || null,
        active: boolField(form, 'active'),
      });
      setEditing(null);
      setMessage('Promotion saved.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Promotions</h2>
        <button type="button" onClick={() => setCreateOpen(true)}>Create promotion</button>
      </div>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Tier</th><th>Discount</th><th>Redemptions</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {data.promotions.map(promo => (
            <tr key={promo.id}>
              <td><strong>{promo.code}</strong></td>
              <td>{promo.name}<br /><span className="muted">{promo.description}</span></td>
              <td>{promo.tierCode || 'any'}</td>
              <td>{promo.discountType} {promo.discountValue}</td>
              <td>{promo.redemptionCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ''}</td>
              <td><StatusBadge value={promo.active} /></td>
              <td><button type="button" onClick={() => setEditing(promo)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {createOpen && (
        <Dialog title="Create promotion" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={create}>
            <label>Code<input name="code" placeholder="PROMO10" required /></label>
            <label>Name<input name="name" placeholder="Promo name" required /></label>
            <label>Tier<CustomSelect name="tierCode" defaultValue="" options={anyTierOptions} /></label>
            <label>Discount type<CustomSelect name="discountType" defaultValue="percent" options={discountTypeOptions} /></label>
            <label>Discount value<input name="discountValue" type="number" placeholder="Value" /></label>
            <label>Max redemptions<input name="maxRedemptions" type="number" placeholder="No limit" /></label>
            <label>Paddle discount ID<input name="paddleDiscountId" placeholder="Paddle discount ID" /></label>
            <label>Description<textarea name="description" placeholder="Description" /></label>
            <label className="check"><input name="active" type="checkbox" defaultChecked /> Active</label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit">Create promotion</button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit promotion" onClose={() => setEditing(null)}>
          <form className="dialog-form" onSubmit={(event) => save(event, editing)}>
            <label>Name<input name="name" defaultValue={editing.name} /></label>
            <label>Description<textarea name="description" defaultValue={editing.description} /></label>
            <label>Tier<CustomSelect name="tierCode" defaultValue={editing.tierCode || ''} options={anyTierOptions} /></label>
            <label>Discount type<CustomSelect name="discountType" defaultValue={editing.discountType} options={discountTypeOptions} /></label>
            <label>Discount value<input name="discountValue" type="number" defaultValue={editing.discountValue} /></label>
            <label>Max redemptions<input name="maxRedemptions" type="number" defaultValue={editing.maxRedemptions || ''} /></label>
            <label>Paddle discount ID<input name="paddleDiscountId" defaultValue={editing.paddleDiscountId || ''} /></label>
            <label className="check"><input name="active" type="checkbox" defaultChecked={editing.active} /> Active</label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit">Save promotion</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function TiersView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PriceTier | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>, code?: string) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const body = {
      code: code || field(form, 'code'),
      name: field(form, 'name'),
      pricingBadge: field(form, 'pricingBadge'),
      monthlyPriceCents: Math.round(numberField(form, 'monthlyPriceDollars') * 100),
      paddlePriceId: field(form, 'paddlePriceId') || null,
      exportLimitPerDay: numberField(form, 'exportLimitPerDay'),
      watermarkEnabled: boolField(form, 'watermarkEnabled'),
      brandingEnabled: boolField(form, 'brandingEnabled'),
      styleEditorEnabled: boolField(form, 'styleEditorEnabled'),
      benefitEditorEnabled: boolField(form, 'benefitEditorEnabled'),
      active: boolField(form, 'active'),
      sortOrder: numberField(form, 'sortOrder'),
    };
    try {
      if (code) {
        await api.updatePriceTier(code, body);
        setEditing(null);
        setMessage('Tier saved.');
      } else {
        await api.savePriceTier(body);
        setCreateOpen(false);
        setMessage('Tier created.');
      }
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Price Tiers</h2>
        <button type="button" onClick={() => setCreateOpen(true)}>Create tier</button>
      </div>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead><tr><th>Tier</th><th>Price</th><th>Paddle Price</th><th>Exports</th><th>Badge</th><th>Flags</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {data.tiers.map(tier => (
            <tr key={tier.code}>
              <td><strong>{tier.name}</strong><br /><span className="muted">{tier.code}</span></td>
              <td>{cents(tier.monthlyPriceCents)}</td>
              <td>{tier.paddlePriceId || '—'}</td>
              <td>{tier.exportLimitPerDay}/day</td>
              <td>{tier.pricingBadge || '—'}</td>
              <td>{tier.watermarkEnabled ? 'watermark ' : ''}{tier.brandingEnabled ? 'branding ' : ''}{tier.styleEditorEnabled ? 'style ' : ''}{tier.benefitEditorEnabled ? 'benefit' : ''}</td>
              <td><StatusBadge value={tier.active} /></td>
              <td><button type="button" onClick={() => setEditing(tier)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {createOpen && (
        <Dialog title="Create tier" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={(event) => save(event)}>
            <label>Code<input name="code" placeholder="team" required /></label>
            <label>Name<input name="name" placeholder="Tier name" required /></label>
            <label>Pricing badge<input name="pricingBadge" placeholder="Popular" /></label>
            <label>Monthly price<input name="monthlyPriceDollars" type="number" step="0.01" placeholder="Monthly $" /></label>
            <label>Exports per day<input name="exportLimitPerDay" type="number" placeholder="Exports/day" /></label>
            <label>Paddle price ID<input name="paddlePriceId" placeholder="Paddle price ID" /></label>
            <label>Sort order<input name="sortOrder" type="number" defaultValue={99} /></label>
            <label className="check"><input name="watermarkEnabled" type="checkbox" defaultChecked /> Watermark</label>
            <label className="check"><input name="brandingEnabled" type="checkbox" /> Branding</label>
            <label className="check"><input name="styleEditorEnabled" type="checkbox" /> Style</label>
            <label className="check"><input name="benefitEditorEnabled" type="checkbox" /> Benefit</label>
            <label className="check"><input name="active" type="checkbox" defaultChecked /> Active</label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit">Create tier</button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit tier" onClose={() => setEditing(null)}>
          <form className="dialog-form" onSubmit={(event) => save(event, editing.code)}>
            <label>Name<input name="name" defaultValue={editing.name} /></label>
            <label>Pricing badge<input name="pricingBadge" defaultValue={editing.pricingBadge || ''} /></label>
            <label>Monthly price<input name="monthlyPriceDollars" type="number" step="0.01" defaultValue={(editing.monthlyPriceCents / 100).toFixed(2)} /></label>
            <label>Paddle price ID<input name="paddlePriceId" defaultValue={editing.paddlePriceId || ''} /></label>
            <label>Exports per day<input name="exportLimitPerDay" type="number" defaultValue={editing.exportLimitPerDay} /></label>
            <label>Sort order<input name="sortOrder" type="number" defaultValue={editing.sortOrder} /></label>
            <label className="check"><input name="watermarkEnabled" type="checkbox" defaultChecked={editing.watermarkEnabled} /> Watermark</label>
            <label className="check"><input name="brandingEnabled" type="checkbox" defaultChecked={editing.brandingEnabled} /> Branding</label>
            <label className="check"><input name="styleEditorEnabled" type="checkbox" defaultChecked={editing.styleEditorEnabled} /> Style</label>
            <label className="check"><input name="benefitEditorEnabled" type="checkbox" defaultChecked={editing.benefitEditorEnabled} /> Benefit</label>
            <label className="check"><input name="active" type="checkbox" defaultChecked={editing.active} /> Active</label>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit">Save tier</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function EntitlementsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const grantMap = useMemo(() => {
    const map = new Map<string, EntitlementGrant>();
    data.entitlementGrants.forEach(grant => map.set(`${grant.tierCode}:${grant.entitlementKey}`, grant));
    return map;
  }, [data.entitlementGrants]);

  function entitlementValue(def: EntitlementDefinition, grant?: EntitlementGrant) {
    const value = grant?.value ?? def.defaultValue;
    if (def.valueType === 'number') return Number(value || 0);
    if (def.valueType === 'boolean') return value === true || value === 'true';
    return String(value ?? '');
  }

  function switchChecked(def: EntitlementDefinition, grant?: EntitlementGrant) {
    const enabled = grant?.enabled ?? true;
    if (def.valueType === 'boolean') return enabled && entitlementValue(def, grant) === true;
    return enabled;
  }

  async function saveToggle(tierCode: string, def: EntitlementDefinition, grant: EntitlementGrant | undefined, checked: boolean, input: HTMLInputElement) {
    const cellKey = `${tierCode}:${def.key}`;
    const value = def.valueType === 'boolean' ? checked : entitlementValue(def, grant);
    setError('');
    setMessage('');
    setSavingKey(cellKey);
    try {
      await api.updateTierEntitlement(tierCode, def.key, { enabled: checked, value });
      setMessage('Entitlement saved.');
      await reload();
    } catch (err) {
      input.checked = !checked;
      setError(messageFromError(err));
    } finally {
      setSavingKey('');
    }
  }

  return (
    <section className="panel">
      <h2>Entitlements</h2>
      <p className="muted">Entitlements are resolved server-side from the customer's active subscription tier or assigned tier.</p>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead>
          <tr><th>Entitlement</th>{data.tiers.map(tier => <th key={tier.code}>{tier.name}</th>)}</tr>
        </thead>
        <tbody>
          {data.entitlementDefinitions.map(def => (
            <tr key={def.key}>
              <td><strong>{def.label}</strong><br /><span className="muted">{def.key}</span></td>
              {data.tiers.map(tier => {
                const grant = grantMap.get(`${tier.code}:${def.key}`);
                const cellKey = `${tier.code}:${def.key}`;
                const value = entitlementValue(def, grant);
                const checked = switchChecked(def, grant);
                return (
                  <td key={tier.code}>
                    <div className="entitlement-cell">
                      <Switcher
                        key={`${cellKey}:${checked}`}
                        checked={checked}
                        disabled={savingKey === cellKey}
                        label={`${tier.name} ${def.label}`}
                        onChange={(nextChecked, input) => saveToggle(tier.code, def, grant, nextChecked, input)}
                      />
                      {def.valueType === 'number' && <span className="entitlement-value">{String(value)}</span>}
                      {def.valueType === 'string' && <span className="entitlement-value">{String(value)}</span>}
                      {savingKey === cellKey && <span className="entitlement-saving">Saving...</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EmailsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [testing, setTesting] = useState<EmailTemplate | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
              <button type="submit">Save settings</button>
            </div>
          </form>
        ) : (
          <div className="empty">Email settings are not loaded.</div>
        )}
      </div>
      <div className="panel email-template-panel">
        <div className="panel-head">
          <h2>Email Templates</h2>
          <button type="button" onClick={() => setCreateOpen(true)}>Create template</button>
        </div>
        {message && <div className="success-box compact">{message}</div>}
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
                  <button type="button" onClick={() => openEdit(template)}>Edit</button>
                  <button type="button" className="ghost-button" onClick={() => setTesting(template)}>Test</button>
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
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit">Create template</button>
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
              <button className="ghost-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit">Save template</button>
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
              <button className="ghost-button" type="button" onClick={() => setTesting(null)}>Cancel</button>
              <button type="submit">Send test</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function AuditView({ logs }: { logs: AuditLog[] }) {
  return (
    <section className="panel">
      <h2>Audit Log</h2>
      <table>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.actorEmail || 'system'}</td>
              <td>{log.action}</td>
              <td>{log.targetType}:{log.targetId}</td>
              <td><code>{JSON.stringify(log.metadata)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
