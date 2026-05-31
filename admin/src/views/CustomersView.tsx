import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { Customer } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  CustomSelect,
  Dialog,
  SortableTh,
  StatusBadge,
  field,
  messageFromError,
  nextSortState,
  sortedRows,
  tierOptions,
  useConfirmDialog,
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';
import { customerStatusOptions } from './options';

type CustomerSortKey = 'name' | 'email' | 'tier' | 'subscription' | 'exports' | 'status';

const customerSortAccessors: Record<CustomerSortKey, (customer: Customer) => SortValue> = {
  name: customer => customer.name,
  email: customer => customer.email,
  tier: customer => customer.subscriptionTier || customer.currentTierCode,
  subscription: customer => customer.subscriptionStatus || 'none',
  exports: customer => customer.exportsToday || 0,
  status: customer => customer.status,
};

export default function CustomersView({ data, reload }: { data: AdminData; reload: (search?: string) => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [entitlements, setEntitlements] = useState<Record<string, unknown> | null>(null);
  const confirmDialog = useConfirmDialog();
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<CustomerSortKey> | null>(null);
  const customers = useMemo(() => sortedRows(data.customers, sort, customerSortAccessors), [data.customers, sort]);
  const defaultTier = data.tiers.find(tier => tier.code === 'free')?.code || data.tiers[0]?.code || '';

  function sortBy(column: CustomerSortKey) {
    setSort(current => nextSortState(current, column));
  }

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

  async function deleteCustomer(customer: Customer) {
    if (!(await confirmDialog({
      title: 'Delete customer?',
      message: `Delete ${customer.email}? This removes related sessions, subscriptions, and export usage. This cannot be undone.`,
      confirmLabel: 'Delete customer',
      variant: 'danger',
    }))) return;
    setError('');
    setMessage('');
    try {
      await api.deleteCustomer(customer.id);
      if (editing?.id === customer.id) {
        setEditing(null);
        setEntitlements(null);
      }
      setMessage('Customer deleted.');
      await reload();
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
            <ActionButton type="submit" icon="search">Search</ActionButton>
          </form>
          <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create customer</ActionButton>
        </div>
      </div>
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead>
          <tr>
            <SortableTh label="Name" column="name" sort={sort} onSort={sortBy} />
            <SortableTh label="Email" column="email" sort={sort} onSort={sortBy} />
            <SortableTh label="Tier" column="tier" sort={sort} onSort={sortBy} />
            <SortableTh label="Subscription" column="subscription" sort={sort} onSort={sortBy} />
            <SortableTh label="Exports" column="exports" sort={sort} onSort={sortBy} />
            <SortableTh label="Status" column="status" sort={sort} onSort={sortBy} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {customers.map(customer => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>{customer.email}</td>
              <td>{customer.subscriptionTier || customer.currentTierCode}</td>
              <td><StatusBadge value={customer.subscriptionStatus || 'none'} /></td>
              <td>{customer.exportsToday || 0}</td>
              <td><StatusBadge value={customer.status} /></td>
              <td className="button-cell">
                <ActionButton type="button" icon="edit" onClick={() => openEdit(customer)}>Edit</ActionButton>
                <ActionButton type="button" icon="trash" className="danger-button" onClick={() => deleteCustomer(customer)}>Delete</ActionButton>
              </td>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create customer</ActionButton>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => { setEditing(null); setEntitlements(null); }}>Cancel</ActionButton>
              <ActionButton type="submit" icon="save">Save customer</ActionButton>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
