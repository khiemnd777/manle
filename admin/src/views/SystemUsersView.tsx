import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { Actor, SystemUser } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  CustomSelect,
  Dialog,
  SortableTh,
  StatusBadge,
  dateOnly,
  field,
  messageFromError,
  nextSortState,
  sortedRows,
  timestamp,
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';
import { customerStatusOptions, systemRoleOptions } from './options';

type SystemUserSortKey = 'name' | 'email' | 'role' | 'status' | 'createdAt';

const systemUserSortAccessors: Record<SystemUserSortKey, (user: SystemUser) => SortValue> = {
  name: user => user.name,
  email: user => user.email,
  role: user => user.role === 'user' ? 'normal user' : user.role,
  status: user => user.status,
  createdAt: user => timestamp(user.createdAt),
};

export default function SystemUsersView({
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
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<SystemUserSortKey> | null>(null);
  const users = useMemo(() => sortedRows(data.systemUsers, sort, systemUserSortAccessors), [data.systemUsers, sort]);

  function sortBy(column: SystemUserSortKey) {
    setSort(current => nextSortState(current, column));
  }

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

  async function deleteUser(user: SystemUser) {
    if (user.id === actor.id) {
      setError('Use the profile page to manage your own account.');
      return;
    }
    if (!window.confirm(`Delete system user ${user.email}? This cannot be undone.`)) return;
    setError('');
    setMessage('');
    try {
      await api.deleteSystemUser(user.id);
      if (editing?.id === user.id) setEditing(null);
      setMessage('System user deleted.');
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
            <ActionButton type="submit" icon="search">Search</ActionButton>
          </form>
          <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create user</ActionButton>
        </div>
      </div>
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead>
          <tr>
            <SortableTh label="Name" column="name" sort={sort} onSort={sortBy} />
            <SortableTh label="Email" column="email" sort={sort} onSort={sortBy} />
            <SortableTh label="Role" column="role" sort={sort} onSort={sortBy} />
            <SortableTh label="Status" column="status" sort={sort} onSort={sortBy} />
            <SortableTh label="Created" column="createdAt" sort={sort} onSort={sortBy} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role === 'user' ? 'normal user' : user.role}</td>
              <td><StatusBadge value={user.status} /></td>
              <td>{dateOnly(user.createdAt)}</td>
              <td className="button-cell">
                <ActionButton type="button" icon={user.id === actor.id ? 'eye' : 'edit'} onClick={() => openEdit(user)}>{user.id === actor.id ? 'View' : 'Edit'}</ActionButton>
                {user.id !== actor.id && <ActionButton type="button" icon="trash" className="danger-button" onClick={() => deleteUser(user)}>Delete</ActionButton>}
              </td>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create user</ActionButton>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setEditing(null)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="save">Save user</ActionButton>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
