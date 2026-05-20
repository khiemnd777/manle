const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

function resolveApiBase() {
  const url = new URL(RAW_API_BASE);
  if (LOOPBACK_HOSTS.has(url.hostname) && LOOPBACK_HOSTS.has(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  return url.origin;
}

const API_BASE = resolveApiBase();
let refreshPromise: Promise<boolean> | null = null;

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'customer';
  status: 'active' | 'disabled';
};

export type SystemUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  currentTierCode: string;
  paddleCustomerId: string | null;
  notes: string;
  createdAt?: string;
  exportsToday?: number;
  subscriptionStatus?: string | null;
  subscriptionTier?: string | null;
};

export type Subscription = {
  id: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  status: string;
  tierCode: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  manualOverride: boolean;
  createdAt: string;
};

export type Promotion = {
  id: string;
  code: string;
  name: string;
  description: string;
  tierCode: string | null;
  discountType: 'percent' | 'amount' | 'trial' | 'custom';
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  paddleDiscountId: string | null;
  active: boolean;
  createdAt: string;
};

export type PriceTier = {
  code: string;
  name: string;
  pricingBadge: string;
  monthlyPriceCents: number;
  paddlePriceId: string | null;
  exportLimitPerDay: number;
  watermarkEnabled: boolean;
  brandingEnabled: boolean;
  styleEditorEnabled: boolean;
  benefitEditorEnabled: boolean;
  active: boolean;
  sortOrder: number;
};

export type EntitlementDefinition = {
  key: string;
  label: string;
  description: string;
  valueType: 'boolean' | 'number' | 'string';
  defaultValue: unknown;
};

export type EntitlementGrant = {
  tierCode: string;
  entitlementKey: string;
  enabled: boolean;
  value: unknown;
};

export type AuditLog = {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type EmailSettings = {
  provider: 'resend';
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  hasResendApiKey: boolean;
  resendApiKeyPreview: string | null;
  updatedAt: string;
};

export type EmailVariable = {
  text: string;
  label: string;
};

export type EmailTemplate = {
  key: string;
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  enabled: boolean;
  system: boolean;
  variables: EmailVariable[];
  createdAt: string;
  updatedAt: string;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path: string, init: RequestInit = {}) {
  return await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function canRefresh(path: string) {
  return !path.includes('/auth/login')
    && !path.includes('/auth/logout')
    && !path.includes('/auth/refresh')
    && !path.includes('/bootstrap');
}

async function refreshAdminAuth() {
  if (!refreshPromise) {
    refreshPromise = request('/api/admin/auth/refresh', { method: 'POST' })
      .then(response => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return await refreshPromise;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await request(path, init);
  if (response.status === 401 && canRefresh(path) && await refreshAdminAuth()) {
    response = await request(path, init);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error?.code || 'request_failed', payload?.error?.message || 'Request failed');
  }
  return payload as T;
}

export const api = {
  bootstrapStatus: () => apiFetch<{ hasAdmin: boolean }>('/api/admin/bootstrap/status'),
  bootstrap: (body: { name: string; email: string; password: string }) =>
    apiFetch<{ actor: Actor }>('/api/admin/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ actor: Actor }>('/api/admin/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch<{ ok: true }>('/api/admin/auth/logout', { method: 'POST' }),
  me: () => apiFetch<{ actor: Actor }>('/api/admin/me'),
  updateProfile: (body: { name: string; email: string; currentPassword?: string; newPassword?: string }) =>
    apiFetch<{ actor: Actor }>('/api/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  overview: () => apiFetch<{ systemUsers: number; customers: number; activeSubscriptions: number; activePromotions: number; activeTiers: number }>('/api/admin/overview'),
  systemUsers: (search = '') => apiFetch<{ users: SystemUser[] }>(`/api/admin/system-users?search=${encodeURIComponent(search)}`),
  systemUser: (id: string) => apiFetch<{ user: SystemUser }>(`/api/admin/system-users/${id}`),
  createSystemUser: (body: Partial<SystemUser> & { password?: string }) =>
    apiFetch<{ user: SystemUser }>('/api/admin/system-users', { method: 'POST', body: JSON.stringify(body) }),
  updateSystemUser: (id: string, body: Partial<SystemUser> & { password?: string }) =>
    apiFetch<{ user: SystemUser }>(`/api/admin/system-users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  customers: (search = '') => apiFetch<{ customers: Customer[] }>(`/api/admin/customers?search=${encodeURIComponent(search)}`),
  createCustomer: (body: Partial<Customer>) =>
    apiFetch<{ customer: Customer }>('/api/admin/customers', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: Partial<Customer>) =>
    apiFetch<{ customer: Customer }>(`/api/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  customerEntitlements: (id: string) =>
    apiFetch<{ userId: string; tierCode: string; entitlements: Record<string, unknown> }>(`/api/admin/customers/${id}/entitlements`),
  subscriptions: () => apiFetch<{ subscriptions: Subscription[] }>('/api/admin/subscriptions'),
  createSubscription: (body: Partial<Subscription>) =>
    apiFetch<{ subscription: { id: string } }>('/api/admin/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  updateSubscription: (id: string, body: Partial<Subscription>) =>
    apiFetch<{ subscription: { id: string } }>(`/api/admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  promotions: () => apiFetch<{ promotions: Promotion[] }>('/api/admin/promotions'),
  createPromotion: (body: Partial<Promotion>) =>
    apiFetch<{ promotion: { id: string } }>('/api/admin/promotions', { method: 'POST', body: JSON.stringify(body) }),
  updatePromotion: (id: string, body: Partial<Promotion>) =>
    apiFetch<{ promotion: { id: string } }>(`/api/admin/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  priceTiers: () => apiFetch<{ tiers: PriceTier[] }>('/api/admin/price-tiers'),
  savePriceTier: (body: Partial<PriceTier>) =>
    apiFetch<{ tier: { code: string } }>('/api/admin/price-tiers', { method: 'POST', body: JSON.stringify(body) }),
  updatePriceTier: (code: string, body: Partial<PriceTier>) =>
    apiFetch<{ tier: { code: string } }>(`/api/admin/price-tiers/${code}`, { method: 'PATCH', body: JSON.stringify(body) }),
  entitlements: () => apiFetch<{ definitions: EntitlementDefinition[]; tiers: PriceTier[]; grants: EntitlementGrant[] }>('/api/admin/entitlements'),
  updateTierEntitlement: (tierCode: string, key: string, body: { enabled: boolean; value: unknown }) =>
    apiFetch<{ grant: EntitlementGrant }>(`/api/admin/entitlements/${tierCode}/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  audit: () => apiFetch<{ logs: AuditLog[] }>('/api/admin/audit'),
  syncPaddle: (body: { subscriptionId?: string; customerId?: string }) =>
    apiFetch<{ ok: true; subscriptionId?: string; customerId?: string; subscriptions?: number }>('/api/admin/paddle/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  emailSettings: () => apiFetch<{ settings: EmailSettings }>('/api/admin/email/settings'),
  updateEmailSettings: (body: Partial<EmailSettings> & { resendApiKey?: string }) =>
    apiFetch<{ settings: EmailSettings }>('/api/admin/email/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  emailTemplates: () => apiFetch<{ templates: EmailTemplate[] }>('/api/admin/email/templates'),
  emailTemplate: (key: string) => apiFetch<{ template: EmailTemplate }>(`/api/admin/email/templates/${encodeURIComponent(key)}`),
  createEmailTemplate: (body: Partial<EmailTemplate>) =>
    apiFetch<{ template: EmailTemplate }>('/api/admin/email/templates', { method: 'POST', body: JSON.stringify(body) }),
  updateEmailTemplate: (key: string, body: Partial<EmailTemplate>) =>
    apiFetch<{ template: EmailTemplate }>(`/api/admin/email/templates/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  sendTestEmail: (body: { templateKey: string; to: string; variables?: Record<string, unknown> }) =>
    apiFetch<{ ok: true; id: string | null }>('/api/admin/email/test', { method: 'POST', body: JSON.stringify(body) }),
};
