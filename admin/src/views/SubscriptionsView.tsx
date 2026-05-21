import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { Subscription } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  CustomSelect,
  Dialog,
  SortableTh,
  StatusBadge,
  boolField,
  dateOnly,
  field,
  messageFromError,
  nextSortState,
  sortedRows,
  tierOptions,
  timestamp,
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';
import { subscriptionStatusOptions } from './options';

type SubscriptionSortKey = 'customer' | 'status' | 'tier' | 'paddleSubscription' | 'periodEnd' | 'flags';

const subscriptionSortAccessors: Record<SubscriptionSortKey, (subscription: Subscription) => SortValue> = {
  customer: subscription => `${subscription.customerName} ${subscription.customerEmail}`,
  status: subscription => subscription.status,
  tier: subscription => subscription.tierCode,
  paddleSubscription: subscription => subscription.paddleSubscriptionId,
  periodEnd: subscription => timestamp(subscription.currentPeriodEnd),
  flags: subscription => `${subscription.cancelAtPeriodEnd ? 'canceling ' : ''}${subscription.manualOverride ? 'manual' : 'Paddle'}`,
};

export default function SubscriptionsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [syncMessage, setSyncMessage] = useFeedbackState('success');
  const [syncError, setSyncError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<SubscriptionSortKey> | null>(null);
  const subscriptions = useMemo(() => sortedRows(data.subscriptions, sort, subscriptionSortAccessors), [data.subscriptions, sort]);
  const defaultTier = data.tiers.find(tier => tier.code === 'basic')?.code || data.tiers[0]?.code || '';
  const customerOptions = [
    { value: '', label: 'Customer' },
    ...data.customers.map(customer => ({ value: customer.id, label: `${customer.name} - ${customer.email}` })),
  ];

  function sortBy(column: SubscriptionSortKey) {
    setSort(current => nextSortState(current, column));
  }

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
        <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create subscription</ActionButton>
      </div>
      <form className="inline-form sync-row" onSubmit={syncPaddle}>
        <input name="syncSubscriptionId" placeholder="Paddle subscription ID" />
        <input name="syncCustomerId" placeholder="or Paddle customer ID" />
        <ActionButton type="submit" icon="sync">Sync Paddle</ActionButton>
      </form>
      {error && <div className="error-box compact">{error}</div>}
      {syncError && <div className="error-box compact">{syncError}</div>}
      <table>
        <thead>
          <tr>
            <SortableTh label="Customer" column="customer" sort={sort} onSort={sortBy} />
            <SortableTh label="Status" column="status" sort={sort} onSort={sortBy} />
            <SortableTh label="Tier" column="tier" sort={sort} onSort={sortBy} />
            <SortableTh label="Paddle subscription" column="paddleSubscription" sort={sort} onSort={sortBy} />
            <SortableTh label="Period end" column="periodEnd" sort={sort} onSort={sortBy} />
            <SortableTh label="Flags" column="flags" sort={sort} onSort={sortBy} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map(sub => (
            <tr key={sub.id}>
              <td>{sub.customerName}<br /><span className="muted">{sub.customerEmail}</span></td>
              <td><StatusBadge value={sub.status} /></td>
              <td>{sub.tierCode}</td>
              <td>{sub.paddleSubscriptionId || '—'}</td>
              <td>{dateOnly(sub.currentPeriodEnd)}</td>
              <td>{sub.cancelAtPeriodEnd ? 'canceling ' : ''}{sub.manualOverride ? 'manual' : 'Paddle'}</td>
              <td><ActionButton type="button" icon="edit" onClick={() => setEditing(sub)}>Edit</ActionButton></td>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create subscription</ActionButton>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setEditing(null)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="save">Save subscription</ActionButton>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
