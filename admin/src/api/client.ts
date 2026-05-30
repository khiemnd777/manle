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

export type PaddleCredentialStatus = {
  hasValue: boolean;
  hasStoredValue: boolean;
  hasEnvValue: boolean;
  preview: string | null;
  source: 'admin' | 'env' | 'none';
};

export type PaddleSettings = {
  apiKey: PaddleCredentialStatus;
  clientToken: PaddleCredentialStatus;
  webhookSecret: PaddleCredentialStatus;
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

export type IllustrationProductType = 'iul' | 'term';
export type IllustrationProfileStatus = 'draft' | 'active' | 'archived';
export type IllustrationProfileVersionStatus = 'draft' | 'published' | 'archived';
export type IllustrationTrainingExampleStatus = 'uploaded' | 'training' | 'reviewed' | 'rejected' | 'archived';
export type IllustrationExtractionRunStatus = 'pending' | 'unsupported_profile' | 'needs_review' | 'succeeded' | 'failed';
export type IllustrationExtractionRunType = 'admin_train' | 'admin_test' | 'runtime_extract';
export type IllustrationRuntimeErrorCode =
  | 'invalid_pdf'
  | 'pdf_parse_failed'
  | 'unsupported_profile'
  | 'no_published_profile'
  | 'low_match_confidence'
  | 'needs_review'
  | 'profile_update_required'
  | 'low_extraction_confidence'
  | 'validation_failed'
  | 'extraction_failed'
  | 'openai_not_configured';
export type IllustrationFieldPath =
  | 'carrier'
  | 'productName'
  | 'productType'
  | 'client.fullName'
  | 'client.age'
  | 'client.gender'
  | 'client.state'
  | 'client.riskClass'
  | 'policy.faceAmount'
  | 'policy.monthlyPremium'
  | 'policy.premiumMode'
  | 'policy.payYears'
  | 'policy.termLength'
  | 'agent.name'
  | 'agent.phone'
  | 'projections[].year'
  | 'projections[].age'
  | 'projections[].policyValue'
  | 'projections[].cashSurrenderValue'
  | 'projections[].cashValue'
  | 'projections[].deathBenefit';

export type IllustrationEvidenceSnippet = {
  page: number;
  text: string;
  confidence: number;
  fieldPath?: IllustrationFieldPath;
  source?: 'pdf_text' | 'filename' | 'admin_correction' | 'manual';
};

export type IllustrationExtract = {
  profileId: string;
  profileVersionId?: string;
  profileVersionNumber?: number;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  client: {
    fullName: string;
    age?: number;
    gender?: 'M' | 'F';
    state?: string;
    riskClass?: string;
  };
  policy: {
    faceAmount?: number;
    monthlyPremium?: number;
    premiumMode?: 'monthly' | 'annual' | 'quarterly';
    payYears?: number;
    termLength?: number;
  };
  projections?: Array<{
    year?: number;
    age: number;
    policyValue?: number;
    cashSurrenderValue?: number;
    cashValue?: number;
    deathBenefit?: number;
  }>;
  agent?: {
    name?: string;
    phone?: string;
  };
  evidence: Record<string, IllustrationEvidenceSnippet>;
  fieldConfidence?: Partial<Record<IllustrationFieldPath, number>>;
  matchScore?: number;
  extractionConfidence?: number;
  schemaVersion?: number;
};

export type IllustrationValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type IllustrationProfileSummary = {
  id: string;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  status: IllustrationProfileStatus;
  notes: string;
  activeVersionId?: string | null;
  activeVersionNumber?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type IllustrationProfileVersionSummary = {
  id: string;
  profileId: string;
  versionNumber: number;
  status: IllustrationProfileVersionStatus;
  schemaVersion: number;
  minMatchScore: number;
  minExtractionConfidence: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IllustrationProfileFingerprint = {
  id?: string;
  profileId?: string;
  profileVersionId?: string;
  fingerprintType: 'carrier' | 'product' | 'form' | 'version' | 'text' | 'regex' | 'layout';
  matchStrategy: 'contains' | 'equals' | 'regex' | 'normalized_contains';
  value: string;
  pageHint?: number | null;
  required: boolean;
  weight: number;
  confidence: number;
  evidenceSnippet?: string;
};

export type IllustrationProfileFieldMapping = {
  id?: string;
  profileId?: string;
  profileVersionId?: string;
  fieldPath: IllustrationFieldPath;
  sourceStrategy: 'label_value' | 'regex' | 'table_cell' | 'filename' | 'constant' | 'manual';
  sourceSelector: Record<string, unknown>;
  transformRules: Record<string, unknown>;
  required: boolean;
  minConfidence: number;
  notes?: string;
};

export type IllustrationProfileProjectionMapping = {
  id?: string;
  profileId?: string;
  profileVersionId?: string;
  projectionKey: string;
  sourceStrategy: 'table' | 'summary_block' | 'regex' | 'manual';
  rowSelector: Record<string, unknown>;
  columnMappings: Record<string, unknown>;
  valueMappings: Record<string, unknown>;
  transformRules: Record<string, unknown>;
  required: boolean;
  minConfidence: number;
  notes?: string;
};

export type IllustrationTrainingExampleSummary = {
  id: string;
  profileId: string;
  profileVersionId?: string | null;
  fileName: string;
  fileSha256: string;
  mimeType: string;
  fileSizeBytes: number;
  status: IllustrationTrainingExampleStatus;
  correctedExtract?: IllustrationExtract | Record<string, unknown>;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | Record<string, unknown>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type IllustrationProfileDetail = IllustrationProfileSummary & {
  versions: IllustrationProfileVersionSummary[];
  draftVersion?: IllustrationProfileVersionSummary | null;
  publishedVersion?: IllustrationProfileVersionSummary | null;
  fingerprints: IllustrationProfileFingerprint[];
  fieldMappings: IllustrationProfileFieldMapping[];
  projectionMappings: IllustrationProfileProjectionMapping[];
  examples: IllustrationTrainingExampleSummary[];
};

export type IllustrationExtractionRunSummary = {
  id: string;
  profileId?: string | null;
  profileVersionId?: string | null;
  trainingExampleId?: string | null;
  runType: IllustrationExtractionRunType;
  status: IllustrationExtractionRunStatus;
  modelProvider?: string | null;
  modelName?: string | null;
  inputSha256?: string | null;
  matchScore?: number | null;
  extractionConfidence?: number | null;
  normalizedExtract?: IllustrationExtract | Record<string, unknown>;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type IllustrationTrainingProposal = {
  profileId: string;
  profileVersionId?: string;
  exampleId?: string;
  runId?: string;
  modelProvider?: string;
  modelName?: string;
  normalizedExtract: IllustrationExtract;
  fingerprints: IllustrationProfileFingerprint[];
  fieldMappings: IllustrationProfileFieldMapping[];
  projectionMappings: IllustrationProfileProjectionMapping[];
  confidence: number;
  issues: IllustrationValidationIssue[];
};

export type IllustrationTrainingUploadInput = {
  file: File;
  profileVersionId?: string;
  notes?: string;
  useFastModel?: boolean;
  maxPages?: number;
};

export type IllustrationTrainingCorrectionInput = {
  profileVersionId?: string | null;
  status?: IllustrationTrainingExampleStatus;
  correctedExtract?: IllustrationExtract | Record<string, unknown>;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | Record<string, unknown>;
  notes?: string;
  fingerprints?: IllustrationProfileFingerprint[];
  fieldMappings?: IllustrationProfileFieldMapping[];
  projectionMappings?: IllustrationProfileProjectionMapping[];
};

export type IllustrationTrainingResponse =
  | {
      status: 'succeeded' | 'needs_review';
      proposal: IllustrationTrainingProposal;
      message?: string;
      example: IllustrationTrainingExampleSummary | null;
      run: IllustrationExtractionRunSummary;
    }
  | {
      status: 'failed';
      code: IllustrationRuntimeErrorCode;
      message: string;
      runId?: string;
      issues?: IllustrationValidationIssue[];
      example: IllustrationTrainingExampleSummary | null;
      run: IllustrationExtractionRunSummary;
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
  const isFormData = init.body instanceof FormData;
  const headers = isFormData
    ? init.headers
    : {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      };
  return await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
}

function canRefresh(path: string) {
  return !path.includes('/auth/login')
    && !path.includes('/auth/forgot-password')
    && !path.includes('/auth/reset-password')
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

function illustrationTrainingForm(body: IllustrationTrainingUploadInput) {
  const form = new FormData();
  form.set('file', body.file);
  if (body.profileVersionId) form.set('profileVersionId', body.profileVersionId);
  if (body.notes) form.set('notes', body.notes);
  if (body.useFastModel != null) form.set('useFastModel', String(body.useFastModel));
  if (body.maxPages != null) form.set('maxPages', String(body.maxPages));
  return form;
}

export const api = {
  bootstrapStatus: () => apiFetch<{ hasAdmin: boolean }>('/api/admin/bootstrap/status'),
  bootstrap: (body: { name: string; email: string; password: string }) =>
    apiFetch<{ actor: Actor }>('/api/admin/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ actor: Actor }>('/api/admin/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  forgotPassword: (body: { email: string }) =>
    apiFetch<{ ok: true }>('/api/admin/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body: { token: string; password: string }) =>
    apiFetch<{ ok: true }>('/api/admin/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
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
  deleteSystemUser: (id: string) =>
    apiFetch<{ ok: true }>(`/api/admin/system-users/${id}`, { method: 'DELETE' }),
  customers: (search = '') => apiFetch<{ customers: Customer[] }>(`/api/admin/customers?search=${encodeURIComponent(search)}`),
  createCustomer: (body: Partial<Customer>) =>
    apiFetch<{ customer: Customer }>('/api/admin/customers', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: Partial<Customer>) =>
    apiFetch<{ customer: Customer }>(`/api/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCustomer: (id: string) =>
    apiFetch<{ ok: true }>(`/api/admin/customers/${id}`, { method: 'DELETE' }),
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
  deletePriceTier: (code: string) =>
    apiFetch<{ ok: true }>(`/api/admin/price-tiers/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  entitlements: () => apiFetch<{ definitions: EntitlementDefinition[]; tiers: PriceTier[]; grants: EntitlementGrant[] }>('/api/admin/entitlements'),
  updateTierEntitlement: (tierCode: string, key: string, body: { enabled: boolean; value: unknown }) =>
    apiFetch<{ grant: EntitlementGrant }>(`/api/admin/entitlements/${tierCode}/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  audit: () => apiFetch<{ logs: AuditLog[] }>('/api/admin/audit'),
  syncPaddle: (body: { subscriptionId?: string; customerId?: string }) =>
    apiFetch<{ ok: true; subscriptionId?: string; customerId?: string; subscriptions?: number }>('/api/admin/paddle/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  paddleSettings: () => apiFetch<{ settings: PaddleSettings }>('/api/admin/paddle/settings'),
  updatePaddleSettings: (body: {
    apiKey?: string;
    clientToken?: string;
    webhookSecret?: string;
    clearApiKey?: boolean;
    clearClientToken?: boolean;
    clearWebhookSecret?: boolean;
  }) =>
    apiFetch<{ settings: PaddleSettings }>('/api/admin/paddle/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  emailSettings: () => apiFetch<{ settings: EmailSettings }>('/api/admin/email/settings'),
  updateEmailSettings: (body: Partial<EmailSettings> & { resendApiKey?: string }) =>
    apiFetch<{ settings: EmailSettings }>('/api/admin/email/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  emailTemplates: () => apiFetch<{ templates: EmailTemplate[] }>('/api/admin/email/templates'),
  emailTemplate: (key: string) => apiFetch<{ template: EmailTemplate }>(`/api/admin/email/templates/${encodeURIComponent(key)}`),
  createEmailTemplate: (body: Partial<EmailTemplate>) =>
    apiFetch<{ template: EmailTemplate }>('/api/admin/email/templates', { method: 'POST', body: JSON.stringify(body) }),
  updateEmailTemplate: (key: string, body: Partial<EmailTemplate>) =>
    apiFetch<{ template: EmailTemplate }>(`/api/admin/email/templates/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEmailTemplate: (key: string) =>
    apiFetch<{ ok: true }>(`/api/admin/email/templates/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  sendTestEmail: (body: { templateKey: string; to: string; variables?: Record<string, unknown> }) =>
    apiFetch<{ ok: true; id: string | null }>('/api/admin/email/test', { method: 'POST', body: JSON.stringify(body) }),
  illustrationProfiles: (search = '') =>
    apiFetch<{ profiles: IllustrationProfileSummary[] }>(`/api/admin/illustration-profiles?search=${encodeURIComponent(search)}`),
  createIllustrationProfile: (body: { carrier: string; productName: string; productType: IllustrationProductType; notes?: string }) =>
    apiFetch<{ profile: IllustrationProfileDetail }>('/api/admin/illustration-profiles', { method: 'POST', body: JSON.stringify(body) }),
  illustrationProfile: (id: string) =>
    apiFetch<{ profile: IllustrationProfileDetail }>(`/api/admin/illustration-profiles/${id}`),
  trainIllustrationProfile: (id: string, body: IllustrationTrainingUploadInput) =>
    apiFetch<IllustrationTrainingResponse>(`/api/admin/illustration-profiles/${id}/train`, {
      method: 'POST',
      body: illustrationTrainingForm(body),
    }),
  correctIllustrationTrainingExample: (profileId: string, exampleId: string, body: IllustrationTrainingCorrectionInput) =>
    apiFetch<{ example: IllustrationTrainingExampleSummary; profile: IllustrationProfileDetail }>(
      `/api/admin/illustration-profiles/${profileId}/examples/${exampleId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  testIllustrationProfile: (id: string, body: IllustrationTrainingUploadInput) =>
    apiFetch<IllustrationTrainingResponse>(`/api/admin/illustration-profiles/${id}/test`, {
      method: 'POST',
      body: illustrationTrainingForm(body),
    }),
  publishIllustrationProfile: (id: string, body: { profileVersionId?: string } = {}) =>
    apiFetch<{ profile: IllustrationProfileDetail }>(`/api/admin/illustration-profiles/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
