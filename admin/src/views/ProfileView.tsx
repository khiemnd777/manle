import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { Actor } from '../api/client';
import {
  ActionButton,
  StatusBadge,
  field,
  messageFromError,
  useFeedbackState,
} from '../adminShared';

export default function ProfileView({ actor, onActorChange }: { actor: Actor; onActorChange: (actor: Actor) => void }) {
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');

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
              <ActionButton type="submit" icon="save">Save profile</ActionButton>
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
              <ActionButton type="submit" icon="save">Change password</ActionButton>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
