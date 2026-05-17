export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'customer';
  status: 'active' | 'disabled';
};

export type Actor = AdminUser;

export type SystemUserRole = 'admin' | 'user';

export type SystemUserInput = {
  email?: string;
  name?: string;
  role?: SystemUserRole;
  status?: 'active' | 'disabled';
  password?: string;
};

export type CustomerInput = {
  email?: string;
  name?: string;
  status?: 'active' | 'disabled';
  currentTierCode?: string;
  paddleCustomerId?: string;
  notes?: string;
};

export type SubscriptionInput = {
  userId?: string;
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  status?: string;
  tierCode?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  manualOverride?: boolean;
};

export type PromotionInput = {
  code?: string;
  name?: string;
  description?: string;
  tierCode?: string | null;
  discountType?: 'percent' | 'amount' | 'trial' | 'custom';
  discountValue?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  paddleDiscountId?: string | null;
  active?: boolean;
};

export type TierInput = {
  code?: string;
  name?: string;
  pricingBadge?: string;
  monthlyPriceCents?: number;
  paddlePriceId?: string | null;
  exportLimitPerDay?: number;
  watermarkEnabled?: boolean;
  brandingEnabled?: boolean;
  styleEditorEnabled?: boolean;
  benefitEditorEnabled?: boolean;
  active?: boolean;
  sortOrder?: number;
};
