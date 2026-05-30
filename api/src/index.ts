import { config } from './config';
import { AppError, fail } from './http/errors';
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
  audit,
  auditLogs,
  createCustomer,
  createPromotion,
  createSubscription,
  createSystemUser,
  deleteCustomer,
  deletePriceTier,
  deleteSystemUser,
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
  applyIllustrationTrainingCorrection,
  createIllustrationProfile,
  ensureDraftIllustrationProfileVersion,
  getIllustrationProfile,
  listIllustrationProfiles,
  publishIllustrationProfileVersion,
  recordIllustrationExtractionRun,
  storeIllustrationTrainingExample,
  updateIllustrationExtractionRun,
} from './services/illustrations';
import { extractPdfTextLayout } from './services/pdfExtraction';
import { generateIllustrationTrainingProposal } from './services/openaiIllustrationExtraction';
import {
  extractRuntimeIllustration,
  invalidRuntimeIllustrationUpload,
  requireRuntimePdfFile,
} from './services/illustrationRuntimeExtraction';
import {
  deleteEmailTemplate,
  getEmailSettings,
  getEmailTemplate,
  listEmailTemplates,
  sendTemplateEmailQuietly,
  sendTestEmail,
  updateEmailSettings,
  upsertEmailTemplate,
} from './services/email';
import {
  getPaddleCheckoutConfig,
  getPaddleClientConfig,
  createCustomerPortalSession,
  getPaddleSettings,
  handlePaddleWebhook,
  syncPaddleSubscription,
  updatePaddleSettings,
} from './services/paddle';
import { rateLimit } from './services/redis';
import type { IllustrationRuntimeErrorCode } from './types/illustration';

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

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function formBool(form: FormData, key: string) {
  const value = formText(form, key).toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function formNumber(form: FormData, key: string) {
  const value = formText(form, key);
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formIllustrationProductType(form: FormData) {
  const value = formText(form, 'productType').toLowerCase();
  return value === 'iul' || value === 'term' ? value : undefined;
}

async function readIllustrationPdfUpload(request: Request) {
  const form = await request.formData();
  const upload = form.get('file') || form.get('pdf');
  if (!(upload instanceof Blob)) {
    fail(400, 'missing_pdf', 'A PDF file is required.');
  }
  const fileName = String((upload as any).name || formText(form, 'fileName') || 'illustration.pdf');
  return {
    file: upload,
    fileName,
    profileVersionId: formText(form, 'profileVersionId') || undefined,
    notes: formText(form, 'notes'),
    useFastModel: formBool(form, 'useFastModel'),
    maxPages: formNumber(form, 'maxPages'),
  };
}

async function runAdminTrainingExtraction(actor: any, profileId: string, request: Request, runType: 'admin_train' | 'admin_test') {
  const profile = await getIllustrationProfile(profileId);
  const upload = await readIllustrationPdfUpload(request);
  const version = upload.profileVersionId
    ? profile.versions.find(item => item.id === upload.profileVersionId)
    : (profile.draftVersion || await ensureDraftIllustrationProfileVersion(actor, profileId));
  if (!version) fail(400, 'missing_profile_version', 'A profile version is required.');

  const pdf = await extractPdfTextLayout(upload.file, {
    fileName: upload.fileName,
    mimeType: upload.file.type || 'application/pdf',
    maxPages: upload.maxPages,
  });
  const example = runType === 'admin_train'
    ? await storeIllustrationTrainingExample(actor, profileId, {
        profileVersionId: version.id,
        fileName: upload.fileName,
        fileSha256: pdf.fileSha256,
        mimeType: pdf.mimeType,
        fileSizeBytes: pdf.fileSizeBytes,
        status: 'training',
        notes: upload.notes,
      })
    : null;
  const run = await recordIllustrationExtractionRun({
    profileId,
    profileVersionId: version.id,
    trainingExampleId: example?.id || null,
    runType,
    status: 'pending',
    inputSha256: pdf.fileSha256,
    metadata: {
      fileName: upload.fileName,
      pageCount: pdf.pageCount,
      extractedPageCount: pdf.pages.length,
    },
    createdBy: actor.id,
  });

  const result = await generateIllustrationTrainingProposal({
    profileId,
    profileVersionId: version.id,
    exampleId: example?.id,
    carrier: profile.carrier,
    productName: profile.productName,
    productType: profile.productType,
    pdf,
    useFastModel: upload.useFastModel,
  });

  if (result.status === 'failed') {
    const updatedRun = await updateIllustrationExtractionRun(run.id, {
      status: 'failed',
      errorCode: result.code,
      errorMessage: result.message,
      metadata: {
        fileName: upload.fileName,
        pageCount: pdf.pageCount,
        extractedPageCount: pdf.pages.length,
      },
    });
    await audit(actor, `illustration_profile.${runType}`, 'illustration_profile', profileId, {
      profileVersionId: version.id,
      runId: run.id,
      status: result.status,
      exampleId: example?.id,
    });
    return { ...result, example, run: updatedRun };
  }

  result.proposal.runId = run.id;
  const updatedRun = await updateIllustrationExtractionRun(run.id, {
    status: result.status === 'succeeded' ? 'succeeded' : 'needs_review',
    modelProvider: result.proposal.modelProvider,
    modelName: result.proposal.modelName,
    extractionConfidence: result.proposal.confidence,
    normalizedExtract: result.proposal.normalizedExtract,
    evidenceSnippets: result.proposal.normalizedExtract.evidence,
    metadata: {
      fileName: upload.fileName,
      pageCount: pdf.pageCount,
      extractedPageCount: pdf.pages.length,
      fingerprintCount: result.proposal.fingerprints.length,
      fieldMappingCount: result.proposal.fieldMappings.length,
      projectionMappingCount: result.proposal.projectionMappings.length,
      issueCount: result.proposal.issues.length,
    },
  });
  await audit(actor, `illustration_profile.${runType}`, 'illustration_profile', profileId, {
    profileVersionId: version.id,
    runId: run.id,
    status: result.status,
    exampleId: example?.id,
  });
  return { ...result, example, run: updatedRun };
}

function runtimeUploadErrorCode(code: string): IllustrationRuntimeErrorCode | null {
  if (code === 'invalid_pdf' || code === 'pdf_parse_failed') return code;
  if (code === 'invalid_mime_type' || code === 'invalid_pdf_input' || code === 'invalid_page_limit' || code === 'missing_pdf') {
    return 'invalid_pdf';
  }
  return null;
}

async function handleRuntimeIllustrationExtract(request: Request) {
  try {
    await assertRateLimit(request, 'illustration-extract', clientIp(request), 20, 300);
    const form = await request.formData();
    const upload = requireRuntimePdfFile(form.get('file') || form.get('pdf'));
    const fileName = String((upload as any).name || formText(form, 'fileName') || 'illustration.pdf');
    const actor = await currentUser(request);
    return json(request, await extractRuntimeIllustration({
      file: upload,
      fileName,
      productType: formIllustrationProductType(form),
      maxPages: formNumber(form, 'maxPages'),
      createdBy: actor?.id || null,
    }));
  } catch (error) {
    if (error instanceof AppError) {
      const code = runtimeUploadErrorCode(error.code);
      if (code) return json(request, invalidRuntimeIllustrationUpload(code, error.message), error.status);
    }
    throw error;
  }
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
    return json(request, await requestPasswordReset(body, { resetOrigin: config.feOrigin, scope: 'customer' }));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const body = await readJson<{ token?: string; password?: string }>(request);
    await assertRateLimit(request, 'password-reset', clientIp(request), 10, 300);
    return json(request, await resetPassword(body, { scope: 'customer' }));
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

  if (request.method === 'GET' && url.pathname === '/api/billing/paddle-client') {
    return json(request, await getPaddleClientConfig());
  }

  if (request.method === 'POST' && url.pathname === '/api/billing/customer-portal') {
    return json(request, await createCustomerPortalSession(await requireUser(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/webhooks/paddle') {
    const rawBody = await request.text();
    return json(request, await handlePaddleWebhook(rawBody, request.headers.get('Paddle-Signature')));
  }

  if (request.method === 'POST' && url.pathname === '/api/illustrations/extract') {
    return await handleRuntimeIllustrationExtract(request);
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

  if (request.method === 'POST' && url.pathname === '/api/admin/auth/forgot-password') {
    const body = await readJson<{ email?: string }>(request);
    await assertRateLimit(request, 'admin-password-reset-request', String(body.email || '').toLowerCase(), 5, 300);
    return json(request, await requestPasswordReset(body, { resetOrigin: config.adminOrigin, scope: 'system' }));
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/auth/reset-password') {
    const body = await readJson<{ token?: string; password?: string }>(request);
    await assertRateLimit(request, 'admin-password-reset', clientIp(request), 10, 300);
    return json(request, await resetPassword(body, { scope: 'system' }));
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

  if (systemUserId && request.method === 'DELETE') {
    return json(request, await deleteSystemUser(actor, systemUserId));
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/paddle/sync') {
    return json(request, await syncPaddleSubscription(actor, await readJson(request)));
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/illustration-profiles') {
    return json(request, { profiles: await listIllustrationProfiles(url.searchParams.get('search') || '') });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/illustration-profiles') {
    return json(request, { profile: await createIllustrationProfile(actor, await readJson(request)) }, 201);
  }

  const illustrationProfileId = idAt(parts, ['api', 'admin', 'illustration-profiles']);
  if (illustrationProfileId && request.method === 'GET') {
    return json(request, { profile: await getIllustrationProfile(illustrationProfileId) });
  }

  if (
    parts.length === 5 &&
    parts[0] === 'api' &&
    parts[1] === 'admin' &&
    parts[2] === 'illustration-profiles' &&
    parts[4] === 'train' &&
    request.method === 'POST'
  ) {
    return json(request, await runAdminTrainingExtraction(actor, parts[3], request, 'admin_train'));
  }

  if (
    parts.length === 6 &&
    parts[0] === 'api' &&
    parts[1] === 'admin' &&
    parts[2] === 'illustration-profiles' &&
    parts[4] === 'examples' &&
    request.method === 'PATCH'
  ) {
    return json(request, await applyIllustrationTrainingCorrection(actor, parts[3], parts[5], await readJson(request)));
  }

  if (
    parts.length === 5 &&
    parts[0] === 'api' &&
    parts[1] === 'admin' &&
    parts[2] === 'illustration-profiles' &&
    parts[4] === 'test' &&
    request.method === 'POST'
  ) {
    return json(request, await runAdminTrainingExtraction(actor, parts[3], request, 'admin_test'));
  }

  if (
    parts.length === 5 &&
    parts[0] === 'api' &&
    parts[1] === 'admin' &&
    parts[2] === 'illustration-profiles' &&
    parts[4] === 'publish' &&
    request.method === 'POST'
  ) {
    const body = await readJson<{ profileVersionId?: string }>(request);
    const profile = await getIllustrationProfile(parts[3]);
    const profileVersionId = body.profileVersionId || profile.draftVersion?.id;
    if (!profileVersionId) fail(400, 'missing_profile_version', 'A draft profile version is required to publish.');
    return json(request, { profile: await publishIllustrationProfileVersion(actor, parts[3], profileVersionId) });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/paddle/settings') {
    return json(request, { settings: await getPaddleSettings() });
  }

  if (request.method === 'PATCH' && url.pathname === '/api/admin/paddle/settings') {
    return json(request, { settings: await updatePaddleSettings(actor, await readJson(request)) });
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

  if (customerId && request.method === 'DELETE') {
    return json(request, await deleteCustomer(actor, customerId));
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

  if (tierCode && request.method === 'DELETE') {
    return json(request, await deletePriceTier(actor, decodeURIComponent(tierCode)));
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

  if (emailTemplateKey && request.method === 'DELETE') {
    return json(request, await deleteEmailTemplate(actor, decodeURIComponent(emailTemplateKey)));
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
