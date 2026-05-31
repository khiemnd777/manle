import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from './api/client';
import type { Actor } from './api/client';
import type { AdminData, View } from './adminTypes';
import {
  ActionButton,
  AppDialogProvider,
  ToastContext,
  ToastStack,
  field,
  messageFromError,
} from './adminShared';
import type { Notify, Toast } from './adminShared';
import { Icon } from './icons';
import type { IconName } from './icons';
import { adminNavItems, emptyData, viewMeta } from './viewConfig';

const SystemUsersView = lazy(() => import('./views/SystemUsersView'));
const CustomersView = lazy(() => import('./views/CustomersView'));
const SubscriptionsView = lazy(() => import('./views/SubscriptionsView'));
const PromotionsView = lazy(() => import('./views/PromotionsView'));
const TiersView = lazy(() => import('./views/TiersView'));
const EntitlementsView = lazy(() => import('./views/EntitlementsView'));
const PaddleSettingsView = lazy(() => import('./views/PaddleSettingsView'));
const EmailsView = lazy(() => import('./views/EmailsView'));
const IllustrationProfilesView = lazy(() => import('./views/IllustrationProfilesView'));
const AuditView = lazy(() => import('./views/AuditView'));
const ProfileView = lazy(() => import('./views/ProfileView'));

type LoginMode = 'login' | 'forgot' | 'reset';
type AuthMessageKind = 'success' | 'info';
type LoadAll = (customerSearch?: string, systemUserSearch?: string, illustrationProfileSearch?: string) => Promise<void>;

function resetTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('reset_token') || '';
}

function clearResetTokenFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('reset_token');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}` || '/');
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

function ScreenFrame({ title, children }: { title: string; children: ReactNode }) {
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
          <ActionButton type="button" icon="check" onClick={onDone}>Continue to login</ActionButton>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>Name<input name="name" placeholder="MANLE Admin" required /></label>
          <label>Email<input name="email" type="email" placeholder="admin@manle.info" required /></label>
          <label>Password<input name="password" type="password" minLength={10} required /></label>
          {error && <div className="error-box">{error}</div>}
          <ActionButton type="submit" icon="plus">Create initial admin</ActionButton>
        </form>
      )}
    </ScreenFrame>
  );
}

function Login({ onLogin }: { onLogin: (actor: Actor) => void }) {
  const initialResetToken = resetTokenFromUrl();
  const [mode, setMode] = useState<LoginMode>(initialResetToken ? 'reset' : 'login');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<AuthMessageKind>('info');
  const [submitting, setSubmitting] = useState(false);

  function showMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
  }

  function leaveResetMode() {
    if (resetToken) {
      clearResetTokenFromUrl();
      setResetToken('');
    }
    showMode('login');
  }

  function setInfo(value: string, kind: AuthMessageKind = 'info') {
    setMessage(value);
    setMessageKind(kind);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    const form = event.currentTarget;
    try {
      const result = await api.login({ email: field(form, 'email'), password: field(form, 'password') });
      onLogin(result.actor);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setInfo('Sending reset link...');
    setSubmitting(true);
    const form = event.currentTarget;
    try {
      const email = field(form, 'email');
      if (!email.includes('@')) throw new Error('Valid email is required.');
      await api.forgotPassword({ email });
      form.reset();
      setInfo('If an internal account exists for this email, a reset link has been sent.', 'success');
    } catch (err) {
      setMessage('');
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    const form = event.currentTarget;
    try {
      const token = field(form, 'token') || resetToken;
      const password = field(form, 'password');
      const confirmPassword = field(form, 'confirmPassword');
      if (!token) throw new Error('Password reset token is missing.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      if (password !== confirmPassword) throw new Error('Password confirmation does not match.');
      await api.resetPassword({ token, password });
      form.reset();
      clearResetTokenFromUrl();
      setResetToken('');
      setMode('login');
      setInfo('Password reset. Sign in with your new password.', 'success');
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenFrame title={mode === 'reset' ? 'Set New Password' : mode === 'forgot' ? 'Reset Admin Password' : 'MANLE Admin Login'}>
      {mode === 'login' && (
        <form className="auth-form" onSubmit={submitLogin}>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <div className="error-box">{error}</div>}
          {message && <div className={`success-box auth-message-${messageKind}`}>{message}</div>}
          <ActionButton type="submit" icon="profile" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'}</ActionButton>
          <div className="auth-secondary-row">
            <button type="button" className="text-button" onClick={() => showMode('forgot')}>Forgot password?</button>
          </div>
        </form>
      )}

      {mode === 'forgot' && (
        <form className="auth-form" onSubmit={submitForgot}>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          {error && <div className="error-box">{error}</div>}
          {message && <div className={`success-box auth-message-${messageKind}`}>{message}</div>}
          <ActionButton type="submit" icon="mail" disabled={submitting}>{submitting ? 'Sending...' : 'Send reset link'}</ActionButton>
          <div className="auth-secondary-row">
            <button type="button" className="text-button" onClick={() => showMode('login')}>Back to login</button>
          </div>
        </form>
      )}

      {mode === 'reset' && (
        <form className="auth-form" onSubmit={submitReset}>
          <input type="hidden" name="token" value={resetToken} readOnly />
          <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          {error && <div className="error-box">{error}</div>}
          {message && <div className={`success-box auth-message-${messageKind}`}>{message}</div>}
          <ActionButton type="submit" icon="save" disabled={submitting}>{submitting ? 'Saving...' : 'Reset password'}</ActionButton>
          <div className="auth-secondary-row">
            <button type="button" className="text-button" onClick={leaveResetMode}>Back to login</button>
          </div>
        </form>
      )}
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeView = viewMeta[view];
  const notify = useCallback<Notify>((kind, title, message) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts(current => [...current.slice(-3), { id, kind, title, message }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const loadAll = useCallback<LoadAll>(async (customerSearch = '', systemUserSearch = '', illustrationProfileSearch = '') => {
    setLoading(true);
    setError('');
    if (!isAdmin) {
      setData(emptyData);
      setLoading(false);
      return;
    }
    try {
      const [overview, systemUsers, customers, subscriptions, promotions, tiers, entitlements, paddleSettings, emailSettings, emailTemplates, illustrationProfiles, audit] = await Promise.all([
        api.overview(),
        api.systemUsers(systemUserSearch),
        api.customers(customerSearch),
        api.subscriptions(),
        api.promotions(),
        api.priceTiers(),
        api.entitlements(),
        api.paddleSettings(),
        api.emailSettings(),
        api.emailTemplates(),
        api.illustrationProfiles(illustrationProfileSearch),
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
        paddleSettings: paddleSettings.settings,
        emailSettings: emailSettings.settings,
        emailTemplates: emailTemplates.templates,
        illustrationProfiles: illustrationProfiles.profiles,
        auditLogs: audit.logs,
      });
    } catch (err) {
      const message = messageFromError(err);
      setError(message);
      notify('error', 'Unable to load admin data', message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!isAdmin && view !== 'profile') setView('profile');
  }, [isAdmin, view]);

  async function logout() {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <ToastContext.Provider value={notify}>
      <AppDialogProvider>
        <div className="admin-layout">
          <aside className="sidebar">
            <div className="side-brand">
              <span className="brand-mark">M</span>
              <div>
                <strong>MANLE Admin</strong>
                <span>Operations Console</span>
              </div>
            </div>
            {isAdmin && (
              <nav className="side-nav" aria-label="Admin sections">
                {adminNavItems.map(item => (
                  <button
                    key={item}
                    className={`side-nav-button${view === item ? ' active' : ''}`}
                    onClick={() => setView(item)}
                    aria-current={view === item ? 'page' : undefined}
                  >
                    <Icon name={viewMeta[item].icon} />
                    <span>{viewMeta[item].label}</span>
                  </button>
                ))}
              </nav>
            )}
            <div className="side-footer">
              <button
                type="button"
                className={`profile-link${view === 'profile' ? ' active' : ''}`}
                onClick={() => setView('profile')}
                aria-current={view === 'profile' ? 'page' : undefined}
              >
                <Icon name="profile" />
                <span>{actor.email}</span>
              </button>
              <ActionButton type="button" icon="logout" onClick={logout}>Logout</ActionButton>
            </div>
          </aside>
          <main className="admin-main">
            <header className="topbar">
              <div className="topbar-title">
                <span className="topbar-icon"><Icon name={activeView.icon} /></span>
                <div>
                  <h1>{activeView.label}</h1>
                  <p>{activeView.description}</p>
                </div>
              </div>
              {isAdmin && <ActionButton type="button" icon="refresh" onClick={() => loadAll()} disabled={loading}>Refresh</ActionButton>}
            </header>
            {isAdmin && (
              <section className="metric-grid" aria-label="Admin overview">
                <Metric icon="users" label="System users" value={data.overview.systemUsers} />
                <Metric icon="customers" label="Customers" value={data.overview.customers} />
                <Metric icon="subscriptions" label="Active subscriptions" value={data.overview.activeSubscriptions} />
                <Metric icon="promotions" label="Active promotions" value={data.overview.activePromotions} />
                <Metric icon="tiers" label="Active tiers" value={data.overview.activeTiers} />
              </section>
            )}
            {error && <div className="error-box">{error}</div>}
            {loading ? <div className="loading">Loading data...</div> : (
              <Suspense fallback={<div className="loading">Loading view...</div>}>
                {view === 'users' && isAdmin && <SystemUsersView actor={actor} data={data} reload={loadAll} />}
                {view === 'customers' && isAdmin && <CustomersView data={data} reload={loadAll} />}
                {view === 'subscriptions' && isAdmin && <SubscriptionsView data={data} reload={loadAll} />}
                {view === 'promotions' && isAdmin && <PromotionsView data={data} reload={loadAll} />}
                {view === 'tiers' && isAdmin && <TiersView data={data} reload={loadAll} />}
                {view === 'entitlements' && isAdmin && <EntitlementsView data={data} reload={loadAll} />}
                {view === 'paddle' && isAdmin && <PaddleSettingsView data={data} reload={loadAll} />}
                {view === 'emails' && isAdmin && <EmailsView data={data} reload={loadAll} />}
                {view === 'illustrations' && isAdmin && <IllustrationProfilesView data={data} reload={loadAll} />}
                {view === 'audit' && isAdmin && <AuditView logs={data.auditLogs} />}
                {view === 'profile' && <ProfileView actor={actor} onActorChange={onActorChange} />}
              </Suspense>
            )}
          </main>
        </div>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </AppDialogProvider>
    </ToastContext.Provider>
  );
}

function Metric({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div className="metric">
      <span className="metric-icon"><Icon name={icon} /></span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
