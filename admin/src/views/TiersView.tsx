import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { PriceTier } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  Dialog,
  SortableTh,
  StatusBadge,
  boolField,
  cents,
  field,
  messageFromError,
  nextSortState,
  numberField,
  sortedRows,
  useConfirmDialog,
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';

type PriceTierSortKey = 'tier' | 'price' | 'paddlePrice' | 'exports' | 'badge' | 'flags' | 'active';

const priceTierSortAccessors: Record<PriceTierSortKey, (tier: PriceTier) => SortValue> = {
  tier: tier => tier.name,
  price: tier => tier.monthlyPriceCents,
  paddlePrice: tier => tier.paddlePriceId,
  exports: tier => tier.exportLimitPerDay,
  badge: tier => tier.pricingBadge,
  flags: tier => `${tier.watermarkEnabled ? 'watermark ' : ''}${tier.brandingEnabled ? 'branding ' : ''}${tier.styleEditorEnabled ? 'style ' : ''}${tier.benefitEditorEnabled ? 'benefit' : ''}`,
  active: tier => tier.active,
};

export default function TiersView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PriceTier | null>(null);
  const confirmDialog = useConfirmDialog();
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<PriceTierSortKey> | null>(null);
  const tiers = useMemo(() => sortedRows(data.tiers, sort, priceTierSortAccessors), [data.tiers, sort]);

  function sortBy(column: PriceTierSortKey) {
    setSort(current => nextSortState(current, column));
  }

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

  async function deleteTier(tier: PriceTier) {
    if (!(await confirmDialog({
      title: 'Delete tier?',
      message: `Delete ${tier.code}? This cannot be undone.`,
      confirmLabel: 'Delete tier',
      variant: 'danger',
    }))) return;
    setError('');
    setMessage('');
    try {
      await api.deletePriceTier(tier.code);
      if (editing?.code === tier.code) setEditing(null);
      setMessage('Tier deleted.');
      await reload();
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Price Tiers</h2>
        <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create tier</ActionButton>
      </div>
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead>
          <tr>
            <SortableTh label="Tier" column="tier" sort={sort} onSort={sortBy} />
            <SortableTh label="Price" column="price" sort={sort} onSort={sortBy} />
            <SortableTh label="Paddle Price" column="paddlePrice" sort={sort} onSort={sortBy} />
            <SortableTh label="Exports" column="exports" sort={sort} onSort={sortBy} />
            <SortableTh label="Badge" column="badge" sort={sort} onSort={sortBy} />
            <SortableTh label="Flags" column="flags" sort={sort} onSort={sortBy} />
            <SortableTh label="Active" column="active" sort={sort} onSort={sortBy} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tiers.map(tier => (
            <tr key={tier.code}>
              <td><strong>{tier.name}</strong><br /><span className="muted">{tier.code}</span></td>
              <td>{cents(tier.monthlyPriceCents)}</td>
              <td>{tier.paddlePriceId || '—'}</td>
              <td>{tier.exportLimitPerDay}/day</td>
              <td>{tier.pricingBadge || '—'}</td>
              <td>{tier.watermarkEnabled ? 'watermark ' : ''}{tier.brandingEnabled ? 'branding ' : ''}{tier.styleEditorEnabled ? 'style ' : ''}{tier.benefitEditorEnabled ? 'benefit' : ''}</td>
              <td><StatusBadge value={tier.active} /></td>
              <td className="button-cell">
                <ActionButton type="button" icon="edit" onClick={() => setEditing(tier)}>Edit</ActionButton>
                <ActionButton type="button" icon="trash" className="danger-button" onClick={() => deleteTier(tier)}>Delete</ActionButton>
              </td>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create tier</ActionButton>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setEditing(null)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="save">Save tier</ActionButton>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
