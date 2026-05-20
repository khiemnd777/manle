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

type Actor = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'customer';
  status: 'active' | 'disabled';
};

type Quota = {
  limit: number;
  used: number;
  remaining: number;
};

type AccountState = {
  actor: Actor | null;
  tierCode: string;
  entitlements: Record<string, unknown>;
  quota: Quota;
  requiresLogin: boolean;
};

export type EntitlementKey = 'watermark' | 'exports_per_day' | 'branding' | 'style_editor' | 'benefit_editor';
export type FeatureKey = 'branding' | 'style_editor' | 'benefit_editor';

const FEATURE_ENTITLEMENT_KEYS: Record<FeatureKey, EntitlementKey> = {
  branding: 'branding',
  style_editor: 'style_editor',
  benefit_editor: 'benefit_editor',
};

type CheckoutConfig = {
  environment: 'sandbox' | 'production';
  clientToken: string;
  priceId: string;
  tierCode: string;
  discountId?: string | null;
  customer: { email: string; name?: string };
  customData: Record<string, unknown>;
};

type PricingTier = {
  code: string;
  name: string;
  monthlyPriceCents: number;
  exportLimitPerDay: number;
  entitlements: Record<string, unknown>;
  featured?: boolean;
  badge?: string | null;
};

export type ExportAuthorization = {
  ok: true;
  tierCode: string;
  format: string;
  entitlements: Record<string, unknown>;
  quota: Quota;
  watermark: boolean;
  branding: boolean;
  styleEditor: boolean;
  benefitEditor: boolean;
};

type FeatureAuthorization = {
  ok: true;
  feature: FeatureKey;
  tierCode: string;
  entitlements: Record<string, unknown>;
};

declare global {
  interface Window {
    Paddle?: any;
  }
}

const defaultAccount: AccountState = {
  actor: null,
  tierCode: 'free',
  entitlements: {
    watermark: true,
    exports_per_day: 3,
    branding: false,
    style_editor: false,
    benefit_editor: false,
  },
  quota: {
    limit: 3,
    used: 0,
    remaining: 3,
  },
  requiresLogin: true,
};

let accountState: AccountState = defaultAccount;
let accountStateLoaded = false;
let pendingCheckoutTier: string | null = null;
let paddleScriptPromise: Promise<void> | null = null;
let paddleInitializedToken = '';
let refreshPromise: Promise<boolean> | null = null;
type ProfileSection = 'account' | 'password';
let profileSection: ProfileSection = 'account';
let checkoutButtonsBound = false;
let pricingTiers: PricingTier[] = [];
const FEATURE_AUTH_TTL_MS = 60_000;
const featureAuthorizationExpiresAt = new Map<FeatureKey, number>();

function byId<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T | null;
}

function text(id: string, value: string) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function show(el: HTMLElement | null, visible: boolean) {
  if (!el) return;
  el.hidden = !visible;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function entitlementsLoaded() {
  return accountStateLoaded;
}

export function canUseEntitlement(key: EntitlementKey, fallback = false) {
  return bool(accountState.entitlements[key], fallback);
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function accountLabel() {
  if (!accountState.actor) return 'Guest';
  return `${accountState.actor.name || accountState.actor.email}`;
}

function tierLabel() {
  return accountState.tierCode.charAt(0).toUpperCase() + accountState.tierCode.slice(1);
}

function hasProLivingBenefitEditor() {
  return canUseEntitlement('benefit_editor');
}

function initialsFor(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : value.slice(0, 2);
  return initials.toUpperCase() || 'G';
}

function setInputValue(id: string, value: string, force = false) {
  const el = byId<HTMLInputElement>(id);
  if (!el) return;
  if (force || document.activeElement !== el) el.value = value;
}

function syncPricingProfileStep(hasActor: boolean) {
  const pricing = byId('pricing');
  if (!pricing) return;
  pricing.dataset.nextTarget = hasActor ? '#profile' : '/generator';
  pricing.dataset.nextLabel = hasActor ? 'Customer Profile' : 'Card Generator';
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
    && !path.includes('/auth/signup')
    && !path.includes('/auth/refresh');
}

async function refreshCustomerAuth() {
  if (!refreshPromise) {
    refreshPromise = request('/api/auth/refresh', { method: 'POST' })
      .then(response => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return await refreshPromise;
}

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  let response = await request(path, init);
  if (response.status === 401 && canRefresh(path) && await refreshCustomerAuth()) {
    response = await request(path, init);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Request failed.';
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = payload?.error?.code || 'request_failed';
    throw error;
  }
  return payload as T;
}

function escapeHTML(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function pricingFeatures(tier: PricingTier) {
  const entitlements = tier.entitlements || {};
  const exportsPerDay = numberValue(entitlements.exports_per_day, tier.exportLimitPerDay);
  const features = [
    bool(entitlements.watermark, true) ? 'Watermark' : 'No watermark',
    `${exportsPerDay} exports/day`,
  ];

  if (bool(entitlements.branding)) features.push('Custom logo and header');
  if (bool(entitlements.style_editor)) features.push('Style editor');
  if (bool(entitlements.benefit_editor)) features.push('Benefit editor');
  if (!bool(entitlements.branding) && !bool(entitlements.style_editor) && !bool(entitlements.benefit_editor)) {
    features.push(tier.code === 'free' ? 'IUL & Term Life templates' : 'PDF, PNG, JPG export');
  }

  return features;
}

function renderPricingTier(tier: PricingTier) {
  const price = Math.round((tier.monthlyPriceCents || 0) / 100);
  const features = pricingFeatures(tier).map(feature => `<li>${escapeHTML(feature)}</li>`).join('');
  const isCurrent = Boolean(accountState.actor) && tier.code === accountState.tierCode;
  const action = isCurrent ? 'Current plan' : (tier.code === 'free' ? 'Start free' : `Choose ${tier.name}`);
  return `
    <article class="price-card ${tier.featured ? 'price-card-featured' : ''} ${isCurrent ? 'price-card-current' : ''}" data-tier-code="${escapeHTML(tier.code)}">
      <div class="price-card-top">
        <div class="price-tier">${escapeHTML(tier.name)}</div>
        <div class="price-badges">
          ${tier.badge ? `<div class="price-badge">${escapeHTML(tier.badge)}</div>` : ''}
          ${isCurrent ? '<div class="price-badge price-badge-current">Current</div>' : ''}
        </div>
      </div>
      <div class="price-value">$${price}<span>/month</span></div>
      <ul>${features}</ul>
      <button type="button" class="price-action" data-checkout-tier="${escapeHTML(tier.code)}" ${isCurrent ? 'disabled aria-disabled="true"' : ''}>${escapeHTML(action)}</button>
    </article>
  `;
}

function renderPricingCards() {
  const grid = byId('pricingGrid');
  if (!grid || !pricingTiers.length) return;
  grid.innerHTML = pricingTiers.map(renderPricingTier).join('');
}

async function loadPricing() {
  const grid = byId('pricingGrid');
  if (!grid) return;
  try {
    const payload = await apiFetch<{ tiers: PricingTier[] }>('/api/pricing');
    const tiers = Array.isArray(payload.tiers) ? payload.tiers : [];
    if (!tiers.length) throw new Error('No active pricing tiers.');
    pricingTiers = tiers;
    renderPricingCards();
  } catch (error) {
    console.warn('Pricing unavailable:', error);
    grid.innerHTML = '<div class="price-card price-card-loading">Pricing is unavailable right now.</div>';
  }
  bindCheckoutButtons();
}

function setControlsLocked(selector: string, locked: boolean) {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>(selector).forEach(el => {
    el.disabled = locked;
    el.setAttribute('aria-disabled', String(locked));
  });
}

function setProfileMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const el = byId('profileMessage');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle('is-success', type === 'success');
  el.classList.toggle('is-error', type === 'error');
}

function clearProfilePasswords() {
  setInputValue('profileCurrentPasswordInput', '', true);
  setInputValue('profilePasswordCurrentInput', '', true);
  setInputValue('profileNewPasswordInput', '', true);
  setInputValue('profileConfirmPasswordInput', '', true);
}

function setProfileSection(section: ProfileSection, clearMessage = false) {
  profileSection = section;
  show(byId('profileForm'), section === 'account');
  show(byId('profilePasswordForm'), section === 'password');

  const accountBtn = byId('profileAccountTabBtn');
  const passwordBtn = byId('profilePasswordTabBtn');
  accountBtn?.classList.toggle('active', section === 'account');
  passwordBtn?.classList.toggle('active', section === 'password');
  accountBtn?.setAttribute('aria-pressed', String(section === 'account'));
  passwordBtn?.setAttribute('aria-pressed', String(section === 'password'));

  if (clearMessage) setProfileMessage('');
}

function scrollToProfile() {
  const target = byId('profile');
  if (!target) return;
  history.pushState(null, '', '#profile');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToPricing() {
  const target = byId('pricing');
  if (!target) return;
  history.pushState(null, '', '#pricing');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAccount() {
  const hasActor = Boolean(accountState.actor);
  const actor = accountState.actor;
  const branding = canUseEntitlement('branding');
  const style = canUseEntitlement('style_editor');
  const watermark = canUseEntitlement('watermark', true);
  const livingBenefitEditor = hasProLivingBenefitEditor();
  const quota = accountState.quota || defaultAccount.quota;
  const label = accountLabel();
  const initials = initialsFor(label);

  document.body.classList.toggle('entitlements-loaded', accountStateLoaded);
  document.body.classList.toggle('entitlement-no-watermark', !watermark);
  document.body.classList.toggle('entitlement-branding', branding);
  document.body.classList.toggle('entitlement-style', style);
  document.body.classList.toggle('entitlement-living-benefits', livingBenefitEditor);
  document.body.classList.toggle('account-authenticated', hasActor);
  syncPricingProfileStep(hasActor);
  renderPricingCards();

  text('landingProfileInitials', initials);
  text('landingProfileName', label);
  text('landingProfileTier', tierLabel());
  text('accountTier', tierLabel());
  text('accountQuota', `${quota.used}/${quota.limit} exports today`);
  text('accountEntitlementNote', watermark ? 'Watermark enabled on exports.' : 'Watermark removed for this tier.');
  text('profileInitials', initials);
  text('profileTitle', hasActor ? label : 'Login to manage your profile');
  text('profileSubtitle', hasActor ? actor?.email || '' : 'Quản lý thông tin tài khoản, tier hiện tại và quota export mỗi ngày.');
  text('profileTier', tierLabel());
  text('profileQuota', `${quota.used}/${quota.limit}`);
  text('profileStatus', hasActor ? (actor?.status || 'active') : 'Guest');
  text('profileHelp', hasActor ? 'Cập nhật name/email. Current password chỉ cần khi đổi email.' : 'Login để cập nhật name/email.');

  if (hasActor && actor) {
    setInputValue('profileNameInput', actor.name || '');
    setInputValue('profileEmailInput', actor.email || '');
  } else {
    setInputValue('profileNameInput', '', true);
    setInputValue('profileEmailInput', '', true);
    clearProfilePasswords();
  }

  show(byId('landingLoginBtn'), !hasActor);
  show(byId('landingProfileBtn'), hasActor);
  show(byId('landingLogoutBtn'), hasActor);
  show(byId('profileLogoutBtn'), hasActor);
  show(byId('profile'), hasActor);
  show(byId('profileAccountTabBtn'), hasActor);
  show(byId('profilePasswordTabBtn'), hasActor);
  show(byId('profileBillingBtn'), hasActor);
  show(byId('profileSaveBtn'), hasActor);
  show(byId('profileLoginBtn'), !hasActor);
  show(byId('profileSignupBtn'), !hasActor);

  if (!hasActor) profileSection = 'account';
  setProfileSection(profileSection);
  setControlsLocked('#profileForm input, #profilePasswordForm input, #profileSaveBtn, #profilePasswordSaveBtn, #profileAccountTabBtn, #profilePasswordTabBtn, #profileBillingBtn', !hasActor);
  setControlsLocked('.header-editor input, .header-editor textarea, .header-editor button', !branding);
  setControlsLocked('#styleEditor .style-editor-body input, #styleEditor .style-editor-body select, #styleEditor .style-editor-body button', !style);
  window.dispatchEvent(new CustomEvent('manle:account-rendered'));
}

function openAuth(mode: 'login' | 'signup' = 'login', tierCode?: string) {
  pendingCheckoutTier = tierCode || pendingCheckoutTier;
  const modal = byId('authModal');
  if (modal) modal.hidden = false;
  setAuthMode(mode);
}

function closeAuth() {
  const modal = byId('authModal');
  if (modal) modal.hidden = true;
}

function setAuthMode(mode: 'login' | 'signup') {
  const loginForm = byId('authLoginForm');
  const signupForm = byId('authSignupForm');
  show(loginForm, mode === 'login');
  show(signupForm, mode === 'signup');
  document.querySelectorAll<HTMLElement>('[data-auth-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.authMode === mode);
  });
}

async function loadAccount() {
  const previousActorId = accountState.actor?.id || null;
  accountState = await apiFetch<AccountState>('/api/me');
  if (!accountState.actor && await refreshCustomerAuth()) {
    accountState = await apiFetch<AccountState>('/api/me');
  }
  const nextActorId = accountState.actor?.id || null;
  if (nextActorId !== previousActorId) featureAuthorizationExpiresAt.clear();
  accountStateLoaded = true;
  renderAccount();
}

async function submitAuth(form: HTMLFormElement, mode: 'login' | 'signup') {
  const fd = new FormData(form);
  const payload = {
    name: String(fd.get('name') || ''),
    email: String(fd.get('email') || ''),
    password: String(fd.get('password') || ''),
  };
  accountState = await apiFetch<AccountState>(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  accountStateLoaded = true;
  featureAuthorizationExpiresAt.clear();
  form.reset();
  closeAuth();
  setProfileMessage('');
  renderAccount();
  if (pendingCheckoutTier) {
    const tier = pendingCheckoutTier;
    pendingCheckoutTier = null;
    await startCheckout(tier);
  }
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  accountState = defaultAccount;
  accountStateLoaded = true;
  featureAuthorizationExpiresAt.clear();
  setProfileMessage('');
  renderAccount();
}

async function submitProfile(form: HTMLFormElement) {
  if (!accountState.actor) {
    openAuth('login');
    return;
  }
  const name = (byId<HTMLInputElement>('profileNameInput')?.value || '').trim();
  const email = (byId<HTMLInputElement>('profileEmailInput')?.value || '').trim();
  const currentPassword = byId<HTMLInputElement>('profileCurrentPasswordInput')?.value || '';
  const emailChanged = email.toLowerCase() !== accountState.actor.email.toLowerCase();

  if (!name) throw new Error('Name is required.');
  if (!email.includes('@')) throw new Error('Valid email is required.');
  if (emailChanged && !currentPassword) {
    throw new Error('Current password is required to change email.');
  }

  const submit = byId<HTMLButtonElement>('profileSaveBtn');
  if (submit) submit.disabled = true;
  setProfileMessage('Saving profile...', 'info');
  try {
    accountState = await apiFetch<AccountState>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        email,
        currentPassword: currentPassword || undefined,
      }),
    });
    form.reset();
    setInputValue('profileCurrentPasswordInput', '', true);
    renderAccount();
    setProfileMessage('Profile saved.', 'success');
  } finally {
    if (submit) submit.disabled = !accountState.actor;
  }
}

async function submitPassword(form: HTMLFormElement) {
  if (!accountState.actor) {
    openAuth('login');
    return;
  }

  const currentPassword = byId<HTMLInputElement>('profilePasswordCurrentInput')?.value || '';
  const newPassword = byId<HTMLInputElement>('profileNewPasswordInput')?.value || '';
  const confirmPassword = byId<HTMLInputElement>('profileConfirmPasswordInput')?.value || '';

  if (!currentPassword) throw new Error('Current password is required to change password.');
  if (!newPassword) throw new Error('New password is required.');
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.');
  if (newPassword !== confirmPassword) throw new Error('New password confirmation does not match.');

  const submit = byId<HTMLButtonElement>('profilePasswordSaveBtn');
  if (submit) submit.disabled = true;
  setProfileMessage('Saving password...', 'info');
  try {
    accountState = await apiFetch<AccountState>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: accountState.actor.name,
        email: accountState.actor.email,
        currentPassword,
        newPassword,
      }),
    });
    form.reset();
    clearProfilePasswords();
    renderAccount();
    setProfileSection('password');
    setProfileMessage('Password changed.', 'success');
  } finally {
    if (submit) submit.disabled = !accountState.actor;
  }
}

function loadPaddleScript() {
  if (window.Paddle) return Promise.resolve();
  if (paddleScriptPromise) return paddleScriptPromise;
  paddleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Paddle Checkout.'));
    document.head.appendChild(script);
  });
  return paddleScriptPromise;
}

function checkoutSuccessUrl() {
  const url = new URL('/generator', window.location.origin);
  return url.toString();
}

async function openPaddleCheckout(config: CheckoutConfig) {
  await loadPaddleScript();
  const paddle = window.Paddle;
  if (!paddle) throw new Error('Paddle Checkout is unavailable.');
  if (config.environment === 'sandbox') {
    paddle.Environment.set('sandbox');
  }
  if (paddleInitializedToken !== config.clientToken) {
    paddle.Initialize({
      token: config.clientToken,
      eventCallback: async (event: any) => {
        if (String(event?.name || '').includes('checkout.completed')) {
          window.setTimeout(() => loadAccount().catch(console.error), 2500);
        }
      },
    });
    paddleInitializedToken = config.clientToken;
  }
  paddle.Checkout.open({
    items: [{ priceId: config.priceId, quantity: 1 }],
    customer: config.customer,
    customData: config.customData,
    discountId: config.discountId || undefined,
    settings: {
      displayMode: 'overlay',
      successUrl: checkoutSuccessUrl(),
    },
  });
}

async function startCheckout(tierCode: string) {
  if (tierCode === 'free') {
    if (!accountState.actor) openAuth('signup');
    window.location.href = '/generator';
    return;
  }
  if (!accountState.actor) {
    openAuth('signup', tierCode);
    return;
  }
  const promo = (byId<HTMLInputElement>('promoCodeInput')?.value || '').trim();
  const checkout = await apiFetch<CheckoutConfig>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ tierCode, promotionCode: promo || undefined }),
  });
  await openPaddleCheckout(checkout);
}

function findPortalUrl(value: unknown): string | null {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPortalUrl(item);
      if (found) return found;
    }
    return null;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    const found = findPortalUrl(item);
    if (found) return found;
  }
  return null;
}

async function openCustomerPortal() {
  const payload = await apiFetch<unknown>('/api/billing/customer-portal', { method: 'POST' });
  const url = findPortalUrl(payload);
  if (!url) throw new Error('Paddle did not return a customer portal URL.');
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function openProfileBilling() {
  if (!accountState.actor) {
    openAuth('login');
    return;
  }
  if (accountState.tierCode === 'free') {
    scrollToPricing();
    return;
  }
  await openCustomerPortal();
}

function bindAuthUi() {
  byId('landingLoginBtn')?.addEventListener('click', () => openAuth('login'));
  byId('landingProfileBtn')?.addEventListener('click', scrollToProfile);
  byId('profileLoginBtn')?.addEventListener('click', () => openAuth('login'));
  byId('profileSignupBtn')?.addEventListener('click', () => openAuth('signup'));
  byId('profileAccountTabBtn')?.addEventListener('click', () => setProfileSection('account', true));
  byId('profilePasswordTabBtn')?.addEventListener('click', () => setProfileSection('password', true));
  byId('profileBillingBtn')?.addEventListener('click', () => openProfileBilling().catch(error => alert(error.message || error)));
  byId('authCloseBtn')?.addEventListener('click', closeAuth);
  byId('authModal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeAuth();
  });
  document.querySelectorAll<HTMLElement>('[data-auth-mode]').forEach(btn => {
    btn.addEventListener('click', () => setAuthMode(btn.dataset.authMode === 'signup' ? 'signup' : 'login'));
  });
  byId<HTMLFormElement>('authLoginForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth(event.currentTarget as HTMLFormElement, 'login').catch(error => alert(error.message || error));
  });
  byId<HTMLFormElement>('authSignupForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth(event.currentTarget as HTMLFormElement, 'signup').catch(error => alert(error.message || error));
  });
  byId<HTMLFormElement>('profileForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitProfile(event.currentTarget as HTMLFormElement).catch(error => setProfileMessage(error.message || String(error), 'error'));
  });
  byId<HTMLFormElement>('profilePasswordForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitPassword(event.currentTarget as HTMLFormElement).catch(error => setProfileMessage(error.message || String(error), 'error'));
  });
  byId('landingLogoutBtn')?.addEventListener('click', () => logout().catch(error => alert(error.message || error)));
  byId('profileLogoutBtn')?.addEventListener('click', () => logout().catch(error => alert(error.message || error)));
}

function bindCheckoutButtons() {
  if (checkoutButtonsBound) return;
  checkoutButtonsBound = true;
  byId('pricingGrid')?.addEventListener('click', event => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-checkout-tier]');
    if (!button) return;
    const tier = button.dataset.checkoutTier || 'free';
    startCheckout(tier).catch(error => alert(error.message || error));
  });
}

export async function authorizeCardExport(format: 'pdf' | 'png' | 'jpg') {
  if (!accountState.actor) {
    openAuth('login');
    throw new Error('Login required before export.');
  }
  const result = await apiFetch<ExportAuthorization>('/api/exports/authorize', {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
  accountState = {
    ...accountState,
    tierCode: result.tierCode,
    entitlements: result.entitlements,
    quota: result.quota,
    requiresLogin: false,
  };
  accountStateLoaded = true;
  renderAccount();
  return result;
}

export async function authorizeFeatureUse(feature: FeatureKey, label = 'this feature') {
  const entitlementKey = FEATURE_ENTITLEMENT_KEYS[feature];
  if (!accountState.actor) {
    openAuth('login');
    throw new Error(`Login required to use ${label}.`);
  }

  const cachedUntil = featureAuthorizationExpiresAt.get(feature) || 0;
  if (canUseEntitlement(entitlementKey) && cachedUntil > Date.now()) return true;

  try {
    const result = await apiFetch<FeatureAuthorization>('/api/features/authorize', {
      method: 'POST',
      body: JSON.stringify({ feature }),
    });
    accountState = {
      ...accountState,
      tierCode: result.tierCode,
      entitlements: result.entitlements,
      requiresLogin: false,
    };
    accountStateLoaded = true;
    renderAccount();
    featureAuthorizationExpiresAt.set(feature, Date.now() + FEATURE_AUTH_TTL_MS);
    return true;
  } catch (error) {
    await loadAccount().catch(refreshError => console.warn('Account refresh after feature denial failed:', refreshError));
    throw error;
  }
}

export function bindAccountAndBilling() {
  renderAccount();
  bindAuthUi();
  loadPricing().catch(error => console.warn('Pricing state unavailable:', error));
  loadAccount().catch(error => {
    console.warn('Account state unavailable:', error);
    accountStateLoaded = true;
    renderAccount();
  });
}
