export const ILLUSTRATION_CONTRACT_SCHEMA_VERSION = 1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type IllustrationProductType = 'iul' | 'term';
export type IllustrationGender = 'M' | 'F';
export type IllustrationPremiumMode = 'monthly' | 'annual' | 'quarterly';

export type IllustrationProfileStatus = 'draft' | 'active' | 'archived';
export type IllustrationProfileVersionStatus = 'draft' | 'published' | 'archived';
export type IllustrationTrainingExampleStatus = 'uploaded' | 'training' | 'needs_review' | 'reviewed' | 'rejected' | 'archived';
export type IllustrationExtractionRunType = 'admin_train' | 'admin_test' | 'runtime_extract';
export type IllustrationExtractionRunStatus = 'pending' | 'unsupported_profile' | 'needs_review' | 'succeeded' | 'failed';

export type IllustrationRuntimeExtractStatus =
  | 'succeeded'
  | 'unsupported_profile'
  | 'no_published_profile'
  | 'needs_review'
  | 'extraction_failed';

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

export type IllustrationFingerprintType = 'carrier' | 'product' | 'form' | 'version' | 'text' | 'regex' | 'layout';
export type IllustrationFingerprintMatchStrategy = 'contains' | 'equals' | 'regex' | 'normalized_contains';
export type IllustrationFieldSourceStrategy = 'label_value' | 'regex' | 'table_cell' | 'filename' | 'constant' | 'manual';
export type IllustrationProjectionSourceStrategy = 'table' | 'summary_block' | 'regex' | 'manual';

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
  | 'policy.illustratedRate'
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

export type IllustrationClientExtract = {
  fullName: string;
  age?: number;
  gender?: IllustrationGender;
  state?: string;
  riskClass?: string;
};

export type IllustrationPolicyExtract = {
  faceAmount?: number;
  monthlyPremium?: number;
  premiumMode?: IllustrationPremiumMode;
  illustratedRate?: number;
  payYears?: number;
  termLength?: number;
};

export type IllustrationProjectionExtract = {
  year?: number;
  age: number;
  policyValue?: number;
  cashSurrenderValue?: number;
  cashValue?: number;
  deathBenefit?: number;
};

export type IllustrationAgentExtract = {
  name?: string;
  phone?: string;
};

export type IllustrationExtract = {
  profileId: string;
  profileVersionId?: string;
  profileVersionNumber?: number;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  client: IllustrationClientExtract;
  policy: IllustrationPolicyExtract;
  projections?: IllustrationProjectionExtract[];
  agent?: IllustrationAgentExtract;
  evidence: Record<string, IllustrationEvidenceSnippet>;
  fieldConfidence?: Partial<Record<IllustrationFieldPath, number>>;
  matchScore?: number;
  extractionConfidence?: number;
  schemaVersion?: number;
};

export type IllustrationValidationIssue = {
  code:
    | 'missing_required_field'
    | 'invalid_product_type'
    | 'invalid_gender'
    | 'invalid_premium_mode'
    | 'invalid_confidence'
    | 'invalid_number'
    | 'invalid_evidence'
    | 'invalid_projection'
    | 'mapping_missing'
    | 'mapping_replay_failed';
  path: string;
  message: string;
};

export type IllustrationValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: IllustrationValidationIssue[] };

export type IllustrationProfileSummary = {
  id: string;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  status: IllustrationProfileStatus;
  notes: string;
  carrierLogoUrl?: string | null;
  carrierLogoMimeType?: string | null;
  carrierLogoFileName?: string | null;
  carrierLogoFileSizeBytes?: number | null;
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

export type IllustrationProfileDetail = IllustrationProfileSummary & {
  versions: IllustrationProfileVersionSummary[];
  draftVersion?: IllustrationProfileVersionSummary | null;
  publishedVersion?: IllustrationProfileVersionSummary | null;
  fingerprints: IllustrationProfileFingerprint[];
  fieldMappings: IllustrationProfileFieldMapping[];
  projectionMappings: IllustrationProfileProjectionMapping[];
  examples: IllustrationTrainingExampleSummary[];
  runs: IllustrationExtractionRunSummary[];
};

export type CreateIllustrationProfileInput = {
  carrier?: string;
  productName?: string;
  productType?: IllustrationProductType;
  notes?: string;
};

export type IllustrationProfileIdentityExtract = {
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  confidence: number;
  evidence: {
    carrier?: IllustrationEvidenceSnippet;
    productName?: IllustrationEvidenceSnippet;
    productType?: IllustrationEvidenceSnippet;
  };
};

export type UpsertIllustrationProfileFromPdfResult = {
  profile: IllustrationProfileDetail;
  identity: IllustrationProfileIdentityExtract;
  created: boolean;
  file: {
    fileName: string;
    fileSha256: string;
    fileSizeBytes: number;
    pageCount: number;
    extractedPageCount: number;
  };
};

export type UpdateIllustrationProfileInput = {
  carrier?: string;
  productName?: string;
  productType?: IllustrationProductType;
  status?: IllustrationProfileStatus;
  notes?: string;
};

export type UpdateIllustrationCarrierLogoInput = {
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileSizeBytes: number;
  dataUrl: string;
};

export type IllustrationProfileFingerprint = {
  id?: string;
  profileId?: string;
  profileVersionId?: string;
  fingerprintType: IllustrationFingerprintType;
  matchStrategy: IllustrationFingerprintMatchStrategy;
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
  sourceStrategy: IllustrationFieldSourceStrategy;
  sourceSelector: JsonObject;
  transformRules: JsonObject;
  required: boolean;
  minConfidence: number;
  notes?: string;
};

export type IllustrationProfileProjectionMapping = {
  id?: string;
  profileId?: string;
  profileVersionId?: string;
  projectionKey: string;
  sourceStrategy: IllustrationProjectionSourceStrategy;
  rowSelector: JsonObject;
  columnMappings: JsonObject;
  valueMappings: JsonObject;
  transformRules: JsonObject;
  required: boolean;
  minConfidence: number;
  notes?: string;
};

export type IllustrationMappingVerificationStatus = 'passed' | 'failed' | 'missing' | 'skipped';

export type IllustrationFieldMappingVerification = {
  fieldPath: IllustrationFieldPath;
  required: boolean;
  status: IllustrationMappingVerificationStatus;
  expectedValue?: JsonValue;
  replayValue?: JsonValue;
  evidence?: IllustrationEvidenceSnippet;
  mappingIndex?: number;
  message?: string;
};

export type IllustrationTrainingVerificationReport = {
  publishable: boolean;
  requiredFieldsPassed: boolean;
  requiredFields: IllustrationFieldPath[];
  fieldMappings: IllustrationFieldMappingVerification[];
  issues: IllustrationValidationIssue[];
  trainingFileName?: string;
  trainingFileSha256?: string;
  verifiedAt: string;
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
  correctedExtract?: IllustrationExtract | JsonObject;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | JsonObject;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type IllustrationTrainingUploadInput = {
  fileName: string;
  mimeType: 'application/pdf';
  fileSizeBytes: number;
  fileSha256?: string;
  correctedExtract?: Partial<IllustrationExtract>;
  notes?: string;
};

export type StoreIllustrationTrainingExampleInput = IllustrationTrainingUploadInput & {
  fileSha256: string;
  profileVersionId?: string | null;
  status?: IllustrationTrainingExampleStatus;
  correctedExtract?: IllustrationExtract | JsonObject;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | JsonObject;
};

export type UpdateIllustrationTrainingExampleInput = {
  profileVersionId?: string | null;
  status?: IllustrationTrainingExampleStatus;
  correctedExtract?: IllustrationExtract | JsonObject;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | JsonObject;
  notes?: string;
};

export type IllustrationTrainingCorrectionInput = UpdateIllustrationTrainingExampleInput & {
  fingerprints?: IllustrationProfileFingerprint[];
  fieldMappings?: IllustrationProfileFieldMapping[];
  projectionMappings?: IllustrationProfileProjectionMapping[];
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
  normalizedExtract?: IllustrationExtract | JsonObject;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | JsonObject;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type StoreIllustrationExtractionRunInput = {
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
  normalizedExtract?: IllustrationExtract | JsonObject;
  evidenceSnippets?: Record<string, IllustrationEvidenceSnippet> | JsonObject;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: JsonObject;
  createdBy?: string | null;
};

export type UpdateIllustrationExtractionRunInput = Partial<
  Pick<
    StoreIllustrationExtractionRunInput,
    | 'profileId'
    | 'profileVersionId'
    | 'trainingExampleId'
    | 'status'
    | 'modelProvider'
    | 'modelName'
    | 'matchScore'
    | 'extractionConfidence'
    | 'normalizedExtract'
    | 'evidenceSnippets'
    | 'errorCode'
    | 'errorMessage'
    | 'metadata'
  >
>;

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
  verification?: IllustrationTrainingVerificationReport;
  confidence: number;
  issues: IllustrationValidationIssue[];
};

export type IllustrationAdminTrainResponse =
  | {
      status: 'succeeded' | 'needs_review';
      proposal: IllustrationTrainingProposal;
      message?: string;
    }
  | {
      status: 'failed';
      code: IllustrationRuntimeErrorCode;
      message: string;
      runId?: string;
      issues?: IllustrationValidationIssue[];
    };

export type IllustrationProfileMatch = {
  profileId: string;
  profileVersionId: string;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  score: number;
  requiredMatched: boolean;
  evidence: Record<string, IllustrationEvidenceSnippet>;
};

export type IllustrationProfileMatchCandidate = IllustrationProfileMatch & {
  minMatchScore: number;
  requiredFingerprintCount: number;
  matchedRequiredFingerprintCount: number;
  totalFingerprintCount: number;
  matchedFingerprintCount: number;
  matchedNonCarrierFingerprint: boolean;
};

export type IllustrationProfileMatchResult =
  | {
      status: 'matched';
      match: IllustrationProfileMatchCandidate;
    }
  | {
      status: 'no_published_profile' | 'unsupported_profile' | 'low_match_confidence';
      code: IllustrationRuntimeErrorCode;
      message: string;
      bestCandidate?: IllustrationProfileMatchCandidate;
      candidates: IllustrationProfileMatchCandidate[];
    };

export type IllustrationRuntimeExtractSuccess = {
  status: 'succeeded';
  extract: IllustrationExtract;
  match: IllustrationProfileMatch;
  assets?: {
    carrierLogoUrl?: string | null;
  };
  runId?: string;
  warnings?: IllustrationValidationIssue[];
};

export type IllustrationRuntimeExtractBlocked = {
  status: Exclude<IllustrationRuntimeExtractStatus, 'succeeded'>;
  code: IllustrationRuntimeErrorCode;
  message: string;
  runId?: string;
  match?: Partial<IllustrationProfileMatch>;
  issues?: IllustrationValidationIssue[];
};

export type IllustrationRuntimeExtractResponse =
  | IllustrationRuntimeExtractSuccess
  | IllustrationRuntimeExtractBlocked;

export type PdfTextItem = {
  text: string;
  page: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type PdfLine = {
  page: number;
  text: string;
  items: PdfTextItem[];
  y?: number;
};

export type PdfExtractionResult = {
  fileSha256: string;
  fileName?: string;
  mimeType: 'application/pdf';
  fileSizeBytes: number;
  pageCount: number;
  text: string;
  pages: Array<{
    page: number;
    text: string;
    lines: PdfLine[];
    items: PdfTextItem[];
  }>;
  metadata?: JsonObject;
};

export function isIllustrationProductType(value: unknown): value is IllustrationProductType {
  return value === 'iul' || value === 'term';
}

export function isIllustrationGender(value: unknown): value is IllustrationGender {
  return value === 'M' || value === 'F';
}

export function isIllustrationPremiumMode(value: unknown): value is IllustrationPremiumMode {
  return value === 'monthly' || value === 'annual' || value === 'quarterly';
}

export function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function requiredIllustrationFieldPaths(productType: IllustrationProductType): IllustrationFieldPath[] {
  const shared: IllustrationFieldPath[] = [
    'carrier',
    'productName',
    'productType',
    'client.fullName',
    'policy.faceAmount',
  ];
  return productType === 'term'
    ? [...shared, 'policy.termLength']
    : [...shared, 'policy.monthlyPremium'];
}

export function extractionRunStatusForRuntimeStatus(status: IllustrationRuntimeExtractStatus): IllustrationExtractionRunStatus {
  if (status === 'no_published_profile' || status === 'unsupported_profile') return 'unsupported_profile';
  if (status === 'extraction_failed') return 'failed';
  return status;
}

export function validateIllustrationExtract(value: unknown): IllustrationValidationResult {
  const issues: IllustrationValidationIssue[] = [];
  const extract = value as Partial<IllustrationExtract> | null;
  if (!extract || typeof extract !== 'object') {
    return {
      ok: false,
      issues: [{ code: 'missing_required_field', path: '', message: 'Illustration extract is required.' }],
    };
  }

  requireString(extract.profileId, 'profileId', issues);
  requireString(extract.carrier, 'carrier', issues);
  requireString(extract.productName, 'productName', issues);
  if (!isIllustrationProductType(extract.productType)) {
    issues.push({ code: 'invalid_product_type', path: 'productType', message: 'Product type must be iul or term.' });
  }

  if (!extract.client || typeof extract.client !== 'object') {
    issues.push({ code: 'missing_required_field', path: 'client', message: 'Client extract is required.' });
  } else {
    requireString(extract.client.fullName, 'client.fullName', issues);
    if (extract.client.age != null) validatePositiveNumber(extract.client.age, 'client.age', issues);
    if (extract.client.gender != null && !isIllustrationGender(extract.client.gender)) {
      issues.push({ code: 'invalid_gender', path: 'client.gender', message: 'Gender must be M or F.' });
    }
  }

  if (!extract.policy || typeof extract.policy !== 'object') {
    issues.push({ code: 'missing_required_field', path: 'policy', message: 'Policy extract is required.' });
  } else {
    if (extract.policy.faceAmount != null) validatePositiveNumber(extract.policy.faceAmount, 'policy.faceAmount', issues);
    if (extract.policy.monthlyPremium != null) validatePositiveNumber(extract.policy.monthlyPremium, 'policy.monthlyPremium', issues);
    if (extract.policy.illustratedRate != null) validatePositiveNumber(extract.policy.illustratedRate, 'policy.illustratedRate', issues);
    if (extract.policy.payYears != null) validatePositiveNumber(extract.policy.payYears, 'policy.payYears', issues);
    if (extract.policy.termLength != null) validatePositiveNumber(extract.policy.termLength, 'policy.termLength', issues);
    if (extract.policy.premiumMode != null && !isIllustrationPremiumMode(extract.policy.premiumMode)) {
      issues.push({ code: 'invalid_premium_mode', path: 'policy.premiumMode', message: 'Premium mode is invalid.' });
    }
  }

  if (!extract.evidence || typeof extract.evidence !== 'object' || Array.isArray(extract.evidence)) {
    issues.push({ code: 'invalid_evidence', path: 'evidence', message: 'Evidence snippets are required.' });
  } else {
    validateEvidenceMap(extract.evidence, issues);
  }

  if (extract.matchScore != null && !isConfidence(extract.matchScore)) {
    issues.push({ code: 'invalid_confidence', path: 'matchScore', message: 'Match score must be between 0 and 1.' });
  }
  if (extract.extractionConfidence != null && !isConfidence(extract.extractionConfidence)) {
    issues.push({ code: 'invalid_confidence', path: 'extractionConfidence', message: 'Extraction confidence must be between 0 and 1.' });
  }
  if (extract.fieldConfidence) {
    for (const [fieldPath, confidence] of Object.entries(extract.fieldConfidence)) {
      if (!isConfidence(confidence)) {
        issues.push({ code: 'invalid_confidence', path: `fieldConfidence.${fieldPath}`, message: 'Field confidence must be between 0 and 1.' });
      }
    }
  }

  if (extract.projections != null) {
    if (!Array.isArray(extract.projections)) {
      issues.push({ code: 'invalid_projection', path: 'projections', message: 'Projections must be an array.' });
    } else {
      extract.projections.forEach((projection, index) => validateProjection(projection, `projections.${index}`, issues));
    }
  }

  if (isIllustrationProductType(extract.productType)) {
    for (const path of requiredIllustrationFieldPaths(extract.productType)) {
      if (!hasExtractPath(extract, path)) {
        issues.push({ code: 'missing_required_field', path, message: `${path} is required for ${extract.productType} extracts.` });
      }
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
}

function requireString(value: unknown, path: string, issues: IllustrationValidationIssue[]) {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ code: 'missing_required_field', path, message: `${path} is required.` });
  }
}

function validatePositiveNumber(value: unknown, path: string, issues: IllustrationValidationIssue[]) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push({ code: 'invalid_number', path, message: `${path} must be a positive number.` });
  }
}

function validateEvidenceMap(evidence: Record<string, IllustrationEvidenceSnippet>, issues: IllustrationValidationIssue[]) {
  for (const [key, snippet] of Object.entries(evidence)) {
    if (!snippet || typeof snippet !== 'object') {
      issues.push({ code: 'invalid_evidence', path: `evidence.${key}`, message: 'Evidence snippet is invalid.' });
      continue;
    }
    if (typeof snippet.page !== 'number' || !Number.isInteger(snippet.page) || snippet.page < 1) {
      issues.push({ code: 'invalid_evidence', path: `evidence.${key}.page`, message: 'Evidence page must be a positive integer.' });
    }
    if (typeof snippet.text !== 'string' || !snippet.text.trim()) {
      issues.push({ code: 'invalid_evidence', path: `evidence.${key}.text`, message: 'Evidence text is required.' });
    }
    if (!isConfidence(snippet.confidence)) {
      issues.push({ code: 'invalid_confidence', path: `evidence.${key}.confidence`, message: 'Evidence confidence must be between 0 and 1.' });
    }
  }
}

function validateProjection(value: unknown, path: string, issues: IllustrationValidationIssue[]) {
  const projection = value as Partial<IllustrationProjectionExtract> | null;
  if (!projection || typeof projection !== 'object') {
    issues.push({ code: 'invalid_projection', path, message: 'Projection is invalid.' });
    return;
  }
  validatePositiveNumber(projection.age, `${path}.age`, issues);
  if (projection.year != null) validatePositiveNumber(projection.year, `${path}.year`, issues);
  if (projection.policyValue != null) validatePositiveNumber(projection.policyValue, `${path}.policyValue`, issues);
  if (projection.cashSurrenderValue != null) validatePositiveNumber(projection.cashSurrenderValue, `${path}.cashSurrenderValue`, issues);
  if (projection.cashValue != null) validatePositiveNumber(projection.cashValue, `${path}.cashValue`, issues);
  if (projection.deathBenefit != null) validatePositiveNumber(projection.deathBenefit, `${path}.deathBenefit`, issues);
}

function hasExtractPath(extract: Partial<IllustrationExtract>, path: IllustrationFieldPath) {
  switch (path) {
    case 'carrier':
      return Boolean(extract.carrier?.trim());
    case 'productName':
      return Boolean(extract.productName?.trim());
    case 'productType':
      return isIllustrationProductType(extract.productType);
    case 'client.fullName':
      return Boolean(extract.client?.fullName?.trim());
    case 'policy.faceAmount':
      return typeof extract.policy?.faceAmount === 'number' && Number.isFinite(extract.policy.faceAmount) && extract.policy.faceAmount > 0;
    case 'policy.monthlyPremium':
      return typeof extract.policy?.monthlyPremium === 'number' && Number.isFinite(extract.policy.monthlyPremium) && extract.policy.monthlyPremium > 0;
    case 'policy.termLength':
      return typeof extract.policy?.termLength === 'number' && Number.isFinite(extract.policy.termLength) && extract.policy.termLength > 0;
    default:
      return true;
  }
}
