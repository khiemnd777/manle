import { config } from './config';
import { AppError } from './http/errors';
import { corsHeaders, json, readJson } from './http/response';
import {
  authCookieHeaders,
  clearOAuthStateCookie,
  clearAuthCookieHeaders,
  completeCustomerOAuth,
  createInitialAdmin,
  currentUser,
  getAdminBootstrapStatus,
  loginAdmin,
  loginCustomer,
  logoutSession,
  oauthFailureRedirectUrl,
  requestPasswordReset,
  refreshAdminSession,
  refreshCustomerSession,
  requireAdmin,
  requireSystemUser,
  requireUser,
  resetPassword,
  signupCustomer,
  startCustomerOAuth,
  updateProfile,
  type OAuthProvider,
} from './services/auth';
import {
  auditLogs,
  createCustomer,
  createPromotion,
  createSubscription,
  createSystemUser,
  effectiveEntitlementsForUser,
  getSystemUser,
  listCustomers,
  listEntitlements,
  listPriceTiers,
  listPublicPricing,
  listPromotions,
  listSubscriptions,
  listSystemUsers,
  overview,
  updateCustomer,
  updatePromotion,
  updateSubscription,
  updateSystemUser,
  updateTierEntitlement,
  upsertPriceTier,
} from './services/admin';
import { accountEntitlements, authorizeExport, authorizeFeature } from './services/entitlements';
import {
  getEmailSettings,
  getEmailTemplate,
  listEmailTemplates,
  sendTemplateEmailQuietly,
  sendTestEmail,
  updateEmailSettings,
  upsertEmailTemplate,
} from './services/email';
import { getPaddleCheckoutConfig, createCustomerPortalSession, handlePaddleWebhook, syncPaddleSubscription } from './services/paddle';
import { rateLimit } from './services/redis';

function pathParts(url: URL) {
  return url.pathname.split('/').filter(Boolean);
}

function idAt(parts: string[], prefix: string[]) {
  if (parts.length !== prefix.length + 1) return null;
  for (let i = 0; i < prefix.length; i += 1) {
    if (parts[i] !== prefix[i]) return null;
  }
  return parts[prefix.length] || null;
}

function clientIp(request: Request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'local';
}

function isOAuthProvider(value?: string): value is OAuthProvider {
  return value === 'google' || value === 'apple';
}

function appendHeaders(target: Headers, values: Record<string, string | string[]>) {
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      value.forEach(item => target.append(key, item));
    } else {
      target.set(key, value);
    }
  }
}

function redirectResponse(location: string, status = 303, headers: Record<string, string | string[]> = {}) {
  const responseHeaders = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
  });
  appendHeaders(responseHeaders, headers);
  return new Response(null, { status, headers: responseHeaders });
}

function oauthErrorCode(error: unknown) {
  return error instanceof AppError ? error.code : 'oauth_failed';
}

function oauthStartFailureRedirectUrl(provider: OAuthProvider, url: URL, code: string) {
  let target = new URL('/generator', config.feOrigin);
  try {
    const requested = new URL(url.searchParams.get('next') || '/generator', config.feOrigin);
    if (requested.origin === config.feOrigin) target = requested;
  } catch {
    target = new URL('/generator', config.feOrigin);
  }
  target.searchParams.set('auth_error', code);
  target.searchParams.set('auth_provider', provider);
  return target.toString();
}

async function readOAuthCallbackInput(request: Request, url: URL) {
  if (request.method === 'POST') {
    const form = await request.formData();
    return {
      code: String(form.get('code') || ''),
      state: String(form.get('state') || ''),
      error: String(form.get('error') || ''),
      user: String(form.get('user') || ''),
    };
  }
  return {
    code: url.searchParams.get('code') || '',
    state: url.searchParams.get('state') || '',
    error: url.searchParams.get('error') || '',
  };
}

async function handleOAuthStart(provider: OAuthProvider, request: Request, url: URL) {
  try {
    const result = startCustomerOAuth(provider, request, {
      next: url.searchParams.get('next'),
      checkoutTier: url.searchParams.get('checkoutTier'),
    });
    return redirectResponse(result.redirectUrl, 302, { 'Set-Cookie': result.stateCookie });
  } catch (error) {
    if (!(error instanceof AppError)) console.error(error);
    return redirectResponse(oauthStartFailureRedirectUrl(provider, url, oauthErrorCode(error)), 303, {
      'Set-Cookie': clearOAuthStateCookie(),
    });
  }
}

async function handleOAuthCallback(provider: OAuthProvider, request: Request, url: URL) {
  try {
    const result = await completeCustomerOAuth(provider, request, await readOAuthCallbackInput(request, url));
    if (result.created) {
      void sendTemplateEmailQuietly('user_greeting', result.actor.email, {
        name: result.actor.name || result.actor.email,
        email: result.actor.email,
      });
    }
    const cookies = authCookieHeaders(result)['Set-Cookie'];
    return redirectResponse(result.redirectUrl, 303, {
      'Set-Cookie': [...cookies, clearOAuthStateCookie()],
    });
  } catch (error) {
    if (!(error instanceof AppError)) console.error(error);
    return redirectResponse(oauthFailureRedirectUrl(request, provider, oauthErrorCode(error)), 303, {
      'Set-Cookie': clearOAuthStateCookie(),
    });
  }
}

async function assertRateLimit(request: Request, scope: string, subject: string, max: number, windowSeconds: number) {
  const result = await rateLimit(`rl:${scope}:${clientIp(request)}:${subject}`, max, windowSeconds);
  if (!result.allowed) {
    throw new AppError(429, 'rate_limited', 'Too many requests. Please try again later.');
  }
}

async function route(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const url = new URL(request.url);
  const parts = pathParts(url);
  const oauthProvider = parts[0] === 'api' && parts[1] === 'auth' && parts[2] === 'oauth' && isOAuthProvider(parts[3])
    ? parts[3]
    : null;

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(request, { ok: true, service: 'manle-api' });
  }

  if (oauthProvider && parts[4] === 'start' && request.method === 'GET') {
    return await handleOAuthStart(oauthProvider, request, url);
  }

  if (oauthProvider && parts[4] === 'callback' && (request.method === 'GET' || request.method === 'POST')) {
    return await handleOAuthCallback(oauthProvider, request, url);
  }

  if (request.method === 'GET' && url.pathname === '/api/me') {
    const actor = await currentUser(request);
    return json(request, await accountEntitlements(actor));
  }

  if (request.method === 'GET' && url.pathname === '/api/entitlements') {
    const actor = await currentUser(request);
    return json(request, await accountEntitlements(actor));
  }

  if (request.method === 'GET' && url.pathname === '/api/pricing') {
    return json(request, await listPublicPricing());
  }

  if (request.method === 'PATCH' && url.pathname === '/api/profile') {
    const actor = await requireUser(request);
    const updated = await updateProfile(actor, await readJson<{ name?: string; email?: string; currentPassword?: string; newPassword?: string }>(request));
    return json(request, await accountEntitlements(updated));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/signup') {
    const body = await readJson<{ name?: string; email?: string; password?: string }>(request);
    await assertRateLimit(request, 'signup', String(body.email || '').toLowerCase(), 8, 300);
    const result = await signupCustomer(body);
    void sendTemplateEmailQuietly('user_greeting', result.actor.email, {
      name: result.actor.name || result.actor.email,
      email: result.actor.email,
    });
    return json(request, await accountEntitlements(result.actor), 201, authCookieHeaders(result));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson<{ email?: string; password?: string }>(request);
    await assertRateLimit(request, 'login', String(body.email || '').toLowerCase(), 10, 300);
    const result = await loginCustomer(body);
    return json(request, await accountEntitlements(result.actor), 200, authCookieHeaders(result));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
    const body = await readJson<{ email?: string }>(request);
    await assertRateLimit(request, 'password-reset-request', String(body.email || '').toLowerCase(), 5, 300);
    return json(request, await requestPasswordReset(body));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const body = await readJson<{ token?: string; password?: string }>(request);
    await assertRateLimit(request, 'password-reset', clientIp(request), 10, 300);
    return json(request, await resetPassword(body));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/refresh') {
    const result = await refreshCustomerSession(request);
    return json(request, await accountEntitlements(result.actor), 200, authCookieHeaders(result));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    await logoutSession(request);
    return json(request, { ok: true }, 200, clearAuthCookieHeaders());
  }

  if (request.method === 'POST' && url.pathname === '/api/exports/authorize') {
    return json(request, await authorizeExport(await requireUser(request), await readJson(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/features/authorize') {
    return json(request, await authorizeFeature(await requireUser(request), await readJson(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/billing/checkout') {
    return json(request, await getPaddleCheckoutConfig(await requireUser(request), await readJson(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/billing/customer-portal') {
    return json(request, await createCustomerPortalSession(await requireUser(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/webhooks/paddle') {
    const rawBody = await request.text();
    return json(request, await handlePaddleWebhook(rawBody, request.headers.get('Paddle-Signature')));
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/bootstrap/status') {
    return json(request, await getAdminBootstrapStatus());
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/bootstrap') {
    const actor = await createInitialAdmin(await readJson(request));
    return json(request, { actor }, 201);
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/auth/login') {
    const result = await loginAdmin(await readJson(request));
    return json(request, { actor: result.actor }, 200, authCookieHeaders(result));
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/auth/refresh') {
    const result = await refreshAdminSession(request);
    return json(request, { actor: result.actor }, 200, authCookieHeaders(result));
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/auth/logout') {
    await logoutSession(request);
    return json(request, { ok: true }, 200, clearAuthCookieHeaders());
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/me') {
    return json(request, { actor: await requireSystemUser(request) });
  }

  if (parts[0] !== 'api' || parts[1] !== 'admin') {
    return json(request, { error: { code: 'not_found', message: 'Route not found.' } }, 404);
  }

  const actor = await requireAdmin(request);

  if (request.method === 'GET' && url.pathname === '/api/admin/overview') {
    return json(request, await overview());
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/system-users') {
    return json(request, { users: await listSystemUsers(url.searchParams.get('search') || '') });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/system-users') {
    return json(request, { user: await createSystemUser(actor, await readJson(request)) }, 201);
  }

  const systemUserId = idAt(parts, ['api', 'admin', 'system-users']);
  if (systemUserId && request.method === 'GET') {
    return json(request, { user: await getSystemUser(systemUserId) });
  }

  if (systemUserId && request.method === 'PATCH') {
    return json(request, { user: await updateSystemUser(actor, systemUserId, await readJson(request)) });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/paddle/sync') {
    return json(request, await syncPaddleSubscription(actor, await readJson(request)));
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/customers') {
    return json(request, { customers: await listCustomers(url.searchParams.get('search') || '') });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/customers') {
    return json(request, { customer: await createCustomer(actor, await readJson(request)) }, 201);
  }

  const customerId = idAt(parts, ['api', 'admin', 'customers']);
  if (customerId && request.method === 'PATCH') {
    return json(request, { customer: await updateCustomer(actor, customerId, await readJson(request)) });
  }

  if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'customers' && parts[4] === 'entitlements' && request.method === 'GET') {
    return json(request, await effectiveEntitlementsForUser(parts[3]));
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/subscriptions') {
    return json(request, { subscriptions: await listSubscriptions(url.searchParams.get('userId') || undefined) });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/subscriptions') {
    return json(request, { subscription: await createSubscription(actor, await readJson(request)) }, 201);
  }

  const subscriptionId = idAt(parts, ['api', 'admin', 'subscriptions']);
  if (subscriptionId && request.method === 'PATCH') {
    return json(request, { subscription: await updateSubscription(actor, subscriptionId, await readJson(request)) });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/promotions') {
    return json(request, { promotions: await listPromotions() });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/promotions') {
    return json(request, { promotion: await createPromotion(actor, await readJson(request)) }, 201);
  }

  const promotionId = idAt(parts, ['api', 'admin', 'promotions']);
  if (promotionId && request.method === 'PATCH') {
    return json(request, { promotion: await updatePromotion(actor, promotionId, await readJson(request)) });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/price-tiers') {
    return json(request, { tiers: await listPriceTiers() });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/price-tiers') {
    return json(request, { tier: await upsertPriceTier(actor, await readJson(request)) }, 201);
  }

  const tierCode = idAt(parts, ['api', 'admin', 'price-tiers']);
  if (tierCode && request.method === 'PATCH') {
    const body = await readJson<Record<string, unknown>>(request);
    return json(request, { tier: await upsertPriceTier(actor, { ...body, code: tierCode } as any) });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/entitlements') {
    return json(request, await listEntitlements());
  }

  if (
    request.method === 'PATCH' &&
    parts.length === 5 &&
    parts[0] === 'api' &&
    parts[1] === 'admin' &&
    parts[2] === 'entitlements'
  ) {
    return json(request, {
      grant: await updateTierEntitlement(actor, parts[3], parts[4], await readJson(request)),
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
    return json(request, { logs: await auditLogs() });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/email/settings') {
    return json(request, { settings: await getEmailSettings() });
  }

  if (request.method === 'PATCH' && url.pathname === '/api/admin/email/settings') {
    return json(request, { settings: await updateEmailSettings(actor, await readJson(request)) });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/email/templates') {
    return json(request, { templates: await listEmailTemplates() });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/email/templates') {
    return json(request, { template: await upsertEmailTemplate(actor, await readJson(request)) }, 201);
  }

  const emailTemplateKey = idAt(parts, ['api', 'admin', 'email', 'templates']);
  if (emailTemplateKey && request.method === 'GET') {
    return json(request, { template: await getEmailTemplate(decodeURIComponent(emailTemplateKey)) });
  }

  if (emailTemplateKey && request.method === 'PATCH') {
    const body = await readJson<Record<string, unknown>>(request);
    return json(request, { template: await upsertEmailTemplate(actor, { ...body, key: decodeURIComponent(emailTemplateKey) } as any) });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/email/test') {
    return json(request, await sendTestEmail(actor, await readJson(request)));
  }

  return json(request, { error: { code: 'not_found', message: 'Route not found.' } }, 404);
}

Bun.serve({
  hostname: config.host,
  port: config.port,
  async fetch(request) {
    try {
      return await route(request);
    } catch (error) {
      if (error instanceof AppError) {
        return json(request, { error: { code: error.code, message: error.message } }, error.status);
      }
      console.error(error);
      return json(request, { error: { code: 'internal_error', message: 'Unexpected server error.' } }, 500);
    }
  },
});

console.log(`MANLE API listening on http://${config.host}:${config.port}`);
