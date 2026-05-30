import type { SelectOption } from '../adminTypes';

export const customerStatusOptions: SelectOption[] = [
  { value: 'active', label: 'active' },
  { value: 'disabled', label: 'disabled' },
];

export const systemRoleOptions: SelectOption[] = [
  { value: 'user', label: 'normal user' },
  { value: 'admin', label: 'admin' },
];

export const subscriptionStatusOptions: SelectOption[] = [
  { value: 'active', label: 'active' },
  { value: 'trialing', label: 'trialing' },
  { value: 'past_due', label: 'past_due' },
  { value: 'canceled', label: 'canceled' },
];

export const discountTypeOptions: SelectOption[] = [
  { value: 'percent', label: 'percent' },
  { value: 'amount', label: 'amount' },
  { value: 'trial', label: 'trial' },
  { value: 'custom', label: 'custom' },
];

export const illustrationProductTypeOptions: SelectOption[] = [
  { value: 'iul', label: 'IUL' },
  { value: 'term', label: 'Term Life' },
];
