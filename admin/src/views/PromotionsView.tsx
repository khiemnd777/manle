import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { Promotion } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  CustomSelect,
  Dialog,
  SortableTh,
  StatusBadge,
  boolField,
  field,
  messageFromError,
  nextSortState,
  numberField,
  sortedRows,
  tierOptions,
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';
import { discountTypeOptions } from './options';

type PromotionSortKey = 'code' | 'name' | 'tier' | 'discount' | 'redemptions' | 'active';

const promotionSortAccessors: Record<PromotionSortKey, (promotion: Promotion) => SortValue> = {
  code: promotion => promotion.code,
  name: promotion => promotion.name,
  tier: promotion => promotion.tierCode || 'any',
  discount: promotion => `${promotion.discountType} ${promotion.discountValue}`,
  redemptions: promotion => promotion.redemptionCount,
  active: promotion => promotion.active,
};

export default function PromotionsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<PromotionSortKey> | null>(null);
  const promotions = useMemo(() => sortedRows(data.promotions, sort, promotionSortAccessors), [data.promotions, sort]);
  const anyTierOptions = tierOptions(data.tiers, { value: '', label: 'Any tier' });

  function sortBy(column: PromotionSortKey) {
    setSort(current => nextSortState(current, column));
  }

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
        <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create promotion</ActionButton>
      </div>
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead>
          <tr>
            <SortableTh label="Code" column="code" sort={sort} onSort={sortBy} />
            <SortableTh label="Name" column="name" sort={sort} onSort={sortBy} />
            <SortableTh label="Tier" column="tier" sort={sort} onSort={sortBy} />
            <SortableTh label="Discount" column="discount" sort={sort} onSort={sortBy} />
            <SortableTh label="Redemptions" column="redemptions" sort={sort} onSort={sortBy} />
            <SortableTh label="Active" column="active" sort={sort} onSort={sortBy} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {promotions.map(promo => (
            <tr key={promo.id}>
              <td><strong>{promo.code}</strong></td>
              <td>{promo.name}<br /><span className="muted">{promo.description}</span></td>
              <td>{promo.tierCode || 'any'}</td>
              <td>{promo.discountType} {promo.discountValue}</td>
              <td>{promo.redemptionCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ''}</td>
              <td><StatusBadge value={promo.active} /></td>
              <td><ActionButton type="button" icon="edit" onClick={() => setEditing(promo)}>Edit</ActionButton></td>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create promotion</ActionButton>
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
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setEditing(null)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="save">Save promotion</ActionButton>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
