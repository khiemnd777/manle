import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';
import {
  pdfFromTrainingReplaySnapshot,
  verifyIllustrationTrainingMappings,
} from './illustrationTrainingVerification';
import {
  sanitizeRuntimeFieldMapping,
  sanitizeRuntimeProjectionMapping,
} from './illustrationMappingSanitizer';
import {
  ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  extractionRunStatusForRuntimeStatus,
  isConfidence,
  isIllustrationProductType,
  requiredIllustrationFieldPaths,
  validateIllustrationExtract,
  type CreateIllustrationProfileInput,
  type IllustrationEvidenceSnippet,
  type IllustrationExtract,
  type IllustrationExtractionRunStatus,
  type IllustrationExtractionRunSummary,
  type IllustrationExtractionRunType,
  type IllustrationFieldPath,
  type IllustrationProfileDetail,
  type IllustrationProfileFieldMapping,
  type IllustrationProfileFingerprint,
  type IllustrationProfileProjectionMapping,
  type IllustrationProfileStatus,
  type IllustrationProfileSummary,
  type IllustrationProfileVersionStatus,
  type IllustrationProfileVersionSummary,
  type IllustrationProductType,
  type IllustrationProfileIdentityExtract,
  type IllustrationRuntimeExtractStatus,
  type IllustrationTrainingCorrectionInput,
  type IllustrationTrainingExampleStatus,
  type IllustrationTrainingExampleSummary,
  type JsonObject,
  type PdfExtractionResult,
  type StoreIllustrationExtractionRunInput,
  type StoreIllustrationTrainingExampleInput,
  type UpdateIllustrationCarrierLogoInput,
  type UpdateIllustrationExtractionRunInput,
  type UpdateIllustrationProfileInput,
  type UpdateIllustrationTrainingExampleInput,
  type UpsertIllustrationProfileFromPdfResult,
} from '../types/illustration';
import { audit } from './admin';

type ProfileRow = {
  id: string;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  status: IllustrationProfileStatus;
  notes: string;
  carrierLogoUrl?: string | null;
  carrierLogoMimeType?: string | null;
  carrierLogoFileName?: string | null;
  carrierLogoFileSizeBytes?: number | string | null;
  activeVersionId?: string | null;
  activeVersionNumber?: number | string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type VersionRow = {
  id: string;
  profileId: string;
  versionNumber: number | string;
  status: IllustrationProfileVersionStatus;
  schemaVersion: number | string;
  minMatchScore: number | string;
  minExtractionConfidence: number | string;
  publishedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type PublishedIllustrationProfileVersion = {
  profile: IllustrationProfileSummary;
  version: IllustrationProfileVersionSummary;
  fingerprints: IllustrationProfileFingerprint[];
  fieldMappings: IllustrationProfileFieldMapping[];
  projectionMappings: IllustrationProfileProjectionMapping[];
};

const MAX_CARRIER_LOGO_FILE_BYTES = 720 * 1024;

function cleanText(value?: string) {
  return (value || '').trim();
}

function timestamp(value: string | Date | null | undefined) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(value);
}

function jsonPayloadOrNull(value: unknown) {
  if (value === undefined) return null;
  return jsonPayload(value);
}

function isProfileIdentityFieldPath(path: string) {
  return path === 'carrier' || path === 'productName' || path === 'productType';
}

function publishRequiredFieldPaths(productType: IllustrationProductType) {
  return requiredIllustrationFieldPaths(productType).filter(path => !isProfileIdentityFieldPath(path));
}

function numberOrFallback(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mergeDuplicatePageHint(current?: number | null, next?: number | null) {
  if (current == null || next == null) return null;
  return current === next ? current : null;
}

function fingerprintStorageKey(fingerprint: IllustrationProfileFingerprint) {
  return [
    fingerprint.fingerprintType,
    fingerprint.matchStrategy,
    cleanText(fingerprint.value),
  ].join('\u0000');
}

function stableRequiredFingerprint(fingerprint: IllustrationProfileFingerprint) {
  return fingerprint.fingerprintType === 'carrier' || fingerprint.fingerprintType === 'product';
}

type FingerprintIdentity = {
  carrier?: string;
  productName?: string;
};

export function dedupeIllustrationProfileFingerprintsForStorage(
  fingerprints: IllustrationProfileFingerprint[],
  identity: FingerprintIdentity = {},
): IllustrationProfileFingerprint[] {
  const byStorageKey = new Map<string, IllustrationProfileFingerprint>();
  for (const fingerprint of fingerprints) {
    const required = stableRequiredFingerprint(fingerprint);
    const carrierValue = fingerprint.fingerprintType === 'carrier' && identity.carrier
      ? cleanText(identity.carrier)
      : null;
    const productValue = fingerprint.fingerprintType === 'product' && identity.productName
      ? cleanText(identity.productName)
      : null;
    const normalized: IllustrationProfileFingerprint = {
      ...fingerprint,
      matchStrategy: productValue ? 'normalized_contains' : fingerprint.matchStrategy,
      value: carrierValue || productValue || cleanText(fingerprint.value),
      required,
      evidenceSnippet: cleanText(fingerprint.evidenceSnippet),
    };
    const key = fingerprintStorageKey(normalized);
    const existing = byStorageKey.get(key);
    if (!existing) {
      byStorageKey.set(key, normalized);
      continue;
    }

    const existingConfidence = numberOrFallback(existing.confidence, 1);
    const nextConfidence = numberOrFallback(normalized.confidence, 1);
    const preferredEvidence = nextConfidence >= existingConfidence && normalized.evidenceSnippet
      ? normalized.evidenceSnippet
      : existing.evidenceSnippet || normalized.evidenceSnippet || '';

    byStorageKey.set(key, {
      ...existing,
      pageHint: mergeDuplicatePageHint(existing.pageHint, normalized.pageHint),
      required: existing.required || normalized.required,
      weight: Math.max(numberOrFallback(existing.weight, 1), numberOrFallback(normalized.weight, 1)),
      confidence: Math.max(existingConfidence, nextConfidence),
      evidenceSnippet: preferredEvidence,
    });
  }
  return [...byStorageKey.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function extractFieldValue(input: unknown, fieldPath: IllustrationFieldPath) {
  const parts = fieldPath.split('.');
  let current: unknown = input;
  for (const part of parts) {
    current = recordValue(current, part);
  }
  return current;
}

function hasCorrectedFieldValue(input: unknown, fieldPath: IllustrationFieldPath) {
  const value = extractFieldValue(input, fieldPath);
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return value != null;
}

function evidenceForField(
  correctedExtract: unknown,
  evidenceSnippets: unknown,
  fieldPath: IllustrationFieldPath,
): IllustrationEvidenceSnippet | null {
  const extractEvidence = recordValue(correctedExtract, 'evidence');
  const candidates = [extractEvidence, evidenceSnippets];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    for (const [key, value] of Object.entries(candidate)) {
      if (key !== fieldPath && !key.startsWith(`${fieldPath}:`) && recordValue(value, 'fieldPath') !== fieldPath) continue;
      if (!isRecord(value)) continue;
      const page = recordValue(value, 'page');
      const text = recordValue(value, 'text');
      const confidence = recordValue(value, 'confidence');
      if (typeof page !== 'number' || typeof text !== 'string' || typeof confidence !== 'number') continue;
      return {
        page,
        text,
        confidence,
        fieldPath,
        source: 'pdf_text',
      };
    }
  }
  return null;
}

function selectorWithPageHint(selector: JsonObject, evidence: IllustrationEvidenceSnippet | null): JsonObject {
  return evidence && evidence.page > 0 ? { ...selector, pageHint: evidence.page } : selector;
}

function fieldMapping(
  fieldPath: IllustrationFieldPath,
  sourceSelector: JsonObject,
  transformRules: JsonObject = {},
  evidence: IllustrationEvidenceSnippet | null = null,
): IllustrationProfileFieldMapping {
  return {
    fieldPath,
    sourceStrategy: 'regex',
    sourceSelector,
    transformRules,
    required: false,
    minConfidence: Math.max(0.7, Math.min(1, evidence?.confidence ?? 0.8)),
    notes: evidence ? `Auto-added from reviewed evidence: ${evidence.text.slice(0, 120)}` : 'Auto-added from reviewed corrected extract.',
  };
}

function termFallbackFieldMapping(
  fieldPath: IllustrationFieldPath,
  evidence: IllustrationEvidenceSnippet | null,
): IllustrationProfileFieldMapping | null {
  switch (fieldPath) {
    case 'client.fullName':
      return fieldMapping(fieldPath, { regex: '(?:Designed For:|Insured Information)\\s*(?<value>[^\\n]+)' }, {}, evidence);
    case 'client.age':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Female|Male),\\s+Age\\s+(?<value>\\d{1,3})' }, evidence), {}, evidence);
    case 'client.gender':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?<value>Female|Male),\\s+Age\\s+\\d{1,3}' }, evidence), { gender: true }, evidence);
    case 'client.state':
      return { ...fieldMapping(fieldPath, selectorWithPageHint({ label: 'Issue State:' }, evidence), {}, evidence), sourceStrategy: 'label_value' };
    case 'client.riskClass':
      return { ...fieldMapping(fieldPath, selectorWithPageHint({ label: 'Risk Class:' }, evidence), {}, evidence), sourceStrategy: 'label_value' };
    case 'policy.faceAmount':
      return fieldMapping(fieldPath, { regex: 'Initial Face Amount:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }, evidence);
    case 'policy.termLength':
      return fieldMapping(fieldPath, { regex: '(?:Term Duration\\s*-\\s*|\\$?\\d[\\d,]*(?:\\.\\d+)?\\s+)(?<value>\\d{1,2})\\s+(?:years|Years\\s+Total Face Amount)' }, {}, evidence);
    case 'policy.monthlyPremium':
      return fieldMapping(fieldPath, { regex: '(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)\\s+Terminal Illness Accelerated Death Benefit[\\s\\S]{0,240}?Initial Monthly Premium' }, { currency: true }, evidence);
    case 'policy.premiumMode':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: 'Premium Mode:\\s*(?<value>Monthly|Annual|Quarterly)' }, evidence), {}, evidence);
    case 'agent.name':
      return { ...fieldMapping(fieldPath, selectorWithPageHint({ label: 'Agent/Representative:' }, evidence), {}, evidence), sourceStrategy: 'label_value', required: false };
    case 'agent.phone':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?<value>\\(\\d{3}\\)\\s*\\d{3}[-\\s]\\d{4})' }, evidence), { phone: true }, evidence);
    default:
      return null;
  }
}

function iulFallbackFieldMapping(
  fieldPath: IllustrationFieldPath,
  evidence: IllustrationEvidenceSnippet | null,
): IllustrationProfileFieldMapping | null {
  switch (fieldPath) {
    case 'client.fullName':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Insured:|Insured Information|Designed For:)\\s*(?<value>[^\\n]+)' }, evidence), {}, evidence);
    case 'client.age':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Age:?\\s*|(?:Female|Male),\\s+Age\\s+)(?<value>\\d{1,3})' }, evidence), {}, evidence);
    case 'client.gender':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?<value>Female|Male|M|F)(?:,\\s+Age\\s+\\d{1,3})?' }, evidence), { gender: true }, evidence);
    case 'client.state':
      return { ...fieldMapping(fieldPath, selectorWithPageHint({ label: 'Issue State:' }, evidence), {}, evidence), sourceStrategy: 'label_value' };
    case 'client.riskClass':
      return { ...fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Rate Class|Risk Class):?\\s*(?<value>[^\\n]+)' }, evidence), {}, evidence), sourceStrategy: 'regex' };
    case 'policy.faceAmount':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Specified amount|Initial Face Amount|Total Face Amount):?\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, evidence), { currency: true }, evidence);
    case 'policy.monthlyPremium':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Premium:|Monthly Premium|Initial Monthly Premium(?: including all Riders)?):?\\s*(\\$?\\d[\\d,]*(?:\\.\\d+)?)|(\\$?\\d[\\d,]*(?:\\.\\d+)?)\\s+(?:Initial Monthly Premium|Monthly Premium)' }, evidence), { currency: true }, evidence);
    case 'policy.premiumMode':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Premium Mode|Mode):?\\s*(?<value>Monthly|Annual|Quarterly)' }, evidence), {}, evidence);
    case 'policy.illustratedRate':
      return fieldMapping(
        fieldPath,
        selectorWithPageHint({
          regex: 'Current Projections[\\s\\S]{0,180}?(?:Interest Rate\\s+\\d+(?:\\.\\d+)?%\\s+){2}Interest Rate\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*%|(?:Illustrated Rates?|Interest Rate):?\\s*(\\d+(?:\\.\\d+)?)\\s*%',
        }, evidence),
        { percent: true },
        evidence,
      );
    case 'policy.payYears':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Duration|Pay Years?):?\\s*(?<value>\\d{1,2})' }, evidence), {}, evidence);
    case 'agent.name':
      return { ...fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?:Life Insurance Producer|Agent/Representative|Agent):?\\s*(?<value>[^\\n]+)' }, evidence), {}, evidence), required: false };
    case 'agent.phone':
      return fieldMapping(fieldPath, selectorWithPageHint({ regex: '(?<value>\\(\\d{3}\\)\\s*\\d{3}[-\\s]\\d{4})' }, evidence), { phone: true }, evidence);
    default:
      return null;
  }
}

function fallbackFieldMapping(
  productType: IllustrationProductType,
  fieldPath: IllustrationFieldPath,
  evidence: IllustrationEvidenceSnippet | null,
): IllustrationProfileFieldMapping | null {
  if (productType === 'term') return termFallbackFieldMapping(fieldPath, evidence);
  if (productType === 'iul') return iulFallbackFieldMapping(fieldPath, evidence);
  return null;
}

function assertReviewedMappingsComplete(productType: IllustrationProductType, mappings: IllustrationProfileFieldMapping[]) {
  const missing = publishRequiredFieldPaths(productType).filter(path =>
    !mappings.some(mapping => mapping.fieldPath === path && mapping.required && mapping.sourceStrategy !== 'manual'),
  );
  if (missing.length) {
    fail(400, 'review_mapping_incomplete', `Cannot approve reviewed mappings because required field mappings are missing: ${missing.join(', ')}.`);
  }
}

function completeReviewedFieldMappings(
  productType: IllustrationProductType,
  input: Pick<IllustrationTrainingCorrectionInput, 'fieldMappings' | 'correctedExtract' | 'evidenceSnippets'>,
) {
  const requiredFields = new Set(publishRequiredFieldPaths(productType));
  const mappings = (input.fieldMappings || [])
    .filter(mapping => !isProfileIdentityFieldPath(mapping.fieldPath))
    .map(mapping => {
      const sanitized = sanitizeRuntimeFieldMapping(mapping);
      return {
        ...sanitized,
        required: requiredFields.has(sanitized.fieldPath),
      };
    });
  return mappings;
}

function cleanProductType(value?: string): IllustrationProductType {
  if (isIllustrationProductType(value)) return value;
  fail(400, 'invalid_product_type', 'Illustration product type must be iul or term.');
}

function cleanOptionalProductType(value?: string | null) {
  if (value == null || value === '') return null;
  return cleanProductType(value);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanIdentityValue(value: string) {
  return normalizeWhitespace(value.replace(/[®™]/g, '').replace(/[,:;]+$/g, ''));
}

function titleCaseKnownAcronyms(value: string) {
  if (value !== value.toUpperCase()) return cleanIdentityValue(value);
  const smallWords = new Set(['and', 'of', 'the', 'for', 'with']);
  const acronyms = new Set(['IUL', 'UL', 'LSW', 'LB', 'II', 'III', 'IV', 'V', 'VI']);
  return cleanIdentityValue(value)
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (acronyms.has(upper)) return upper;
      if (index > 0 && smallWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function normalizeCarrierIdentity(value: string) {
  const cleaned = cleanIdentityValue(value);
  if (/transamerica life insurance company/i.test(cleaned)) return 'Transamerica Life Insurance Company';
  if (/life insurance company of the southwest/i.test(cleaned)) return 'Life Insurance Company of the Southwest';
  if (/nationwide life and annuity insurance company/i.test(cleaned)) return 'Nationwide Life and Annuity Insurance Company';
  if (/nationwide life insurance company/i.test(cleaned)) return 'Nationwide Life Insurance Company';
  return cleaned;
}

function normalizeProductIdentity(value: string) {
  const cleaned = cleanIdentityValue(value);
  if (/transamerica financial foundation iul ii/i.test(cleaned)) return 'Transamerica Financial Foundation IUL II';
  if (/^flexlife\b/i.test(cleaned)) return 'FlexLife';
  if (/nationwide indexed ul accumulator iii/i.test(cleaned)) return 'Nationwide Indexed UL Accumulator III';
  if (/trendsetter\s+lb/i.test(cleaned)) return 'Trendsetter LB';
  return titleCaseKnownAcronyms(cleaned);
}

function evidenceSnippet(text: string, index: number, length: number) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 120);
  return normalizeWhitespace(text.slice(start, end));
}

function findPdfIdentityEvidence(
  pdf: PdfExtractionResult,
  patterns: Array<{ regex: RegExp; normalize: (value: string) => string; confidence: number }>,
) {
  for (const page of pdf.pages) {
    for (const pattern of patterns) {
      const match = page.text.match(pattern.regex);
      const rawValue = match?.groups?.value || match?.[0];
      if (!match || !rawValue) continue;
      const value = pattern.normalize(rawValue);
      if (!value) continue;
      return {
        value,
        evidence: {
          page: page.page,
          text: evidenceSnippet(page.text, match.index ?? 0, rawValue.length),
          confidence: pattern.confidence,
          source: 'pdf_text' as const,
        },
      };
    }
  }
  return null;
}

function findFilenameProductIdentity(fileName: string | undefined, carrier: string) {
  if (!fileName || !carrier) return null;
  const baseName = fileName.replace(/\.[^.]+$/g, '');
  const normalizedBaseName = normalizeWhitespace(baseName);
  const index = normalizedBaseName.toLowerCase().indexOf(carrier.toLowerCase());
  if (index < 0) return null;
  const afterCarrier = normalizedBaseName.slice(index + carrier.length).split(' - ')[0].trim();
  const value = normalizeProductIdentity(afterCarrier);
  if (!value || value.length < 3) return null;
  return {
    value,
    evidence: {
      page: 0,
      text: fileName,
      confidence: 0.75,
      source: 'filename' as const,
    },
  };
}

function detectProductTypeIdentity(pdf: PdfExtractionResult, productTypeHint?: IllustrationProductType | null) {
  if (productTypeHint) {
    return {
      value: productTypeHint,
      evidence: {
        page: 0,
        text: productTypeHint,
        confidence: 0.9,
        source: 'manual' as const,
      },
    };
  }

  const term = findPdfIdentityEvidence(pdf, [
    { regex: /\b(?:Trendsetter|Level Term Period|Guaranteed Level Term|Term Life)\b/i, normalize: () => 'term', confidence: 0.8 },
  ]);
  if (term) {
    return { value: 'term' as IllustrationProductType, evidence: term.evidence };
  }

  const iul = findPdfIdentityEvidence(pdf, [
    { regex: /\b(?:Indexed Universal Life|IUL|Index Account|FlexLife)\b/i, normalize: () => 'iul', confidence: 0.85 },
  ]);
  if (iul) {
    return { value: 'iul' as IllustrationProductType, evidence: iul.evidence };
  }

  return null;
}

export function extractIllustrationProfileIdentityFromPdf(
  pdf: PdfExtractionResult,
  productTypeHint?: IllustrationProductType | null,
): IllustrationProfileIdentityExtract {
  const carrier = findPdfIdentityEvidence(pdf, [
    { regex: /Transamerica\s+Life\s+Insurance\s+Company/i, normalize: normalizeCarrierIdentity, confidence: 0.95 },
    { regex: /Life\s+Insurance\s+Company\s+of\s+the\s+Southwest/i, normalize: normalizeCarrierIdentity, confidence: 0.95 },
    { regex: /Nationwide\s+Life\s+and\s+Annuity\s+Insurance\s+Company/i, normalize: normalizeCarrierIdentity, confidence: 0.9 },
    { regex: /Nationwide\s+Life\s+Insurance\s+Company/i, normalize: normalizeCarrierIdentity, confidence: 0.9 },
    {
      regex: /\b(?<value>[A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+){0,6}\s+(?:Life Insurance Company|Insurance Company))\b/,
      normalize: normalizeCarrierIdentity,
      confidence: 0.7,
    },
  ]);

  if (!carrier) {
    fail(422, 'profile_identity_not_found', 'Could not detect the illustration carrier from the uploaded PDF.');
  }

  const product = findPdfIdentityEvidence(pdf, [
    { regex: /TRANSAMERICA\s+FINANCIAL\s+FOUNDATION\s+IUL\s+II/i, normalize: normalizeProductIdentity, confidence: 0.95 },
    { regex: /\bFlexLife\b(?:\s+INDEXED\s+UNIVERSAL\s+LIFE|,?\s+Form\s+Number|\s+Indexed\s+Universal\s+Life)?/i, normalize: normalizeProductIdentity, confidence: 0.95 },
    { regex: /Nationwide\s+Indexed\s+UL\s+Accumulator\s+III/i, normalize: normalizeProductIdentity, confidence: 0.9 },
    { regex: /\b(?:Transamerica\s+)?(?<value>Trendsetter\s+LB)(?:\s+\d{2})?\b/i, normalize: normalizeProductIdentity, confidence: 0.95 },
    {
      regex: /\b(?<value>[A-Z][A-Za-z0-9&.' -]{2,80}?(?:IUL|UL Accumulator|Indexed Universal Life)(?:\s+(?:I{1,3}|IV|V))?)\b/i,
      normalize: normalizeProductIdentity,
      confidence: 0.7,
    },
  ]) || findFilenameProductIdentity(pdf.fileName, carrier.value);

  if (!product) {
    fail(422, 'profile_identity_not_found', 'Could not detect the illustration product from the uploaded PDF.');
  }

  const productType = detectProductTypeIdentity(pdf, productTypeHint);
  if (!productType) {
    fail(422, 'profile_identity_not_found', 'Could not detect whether the illustration is IUL or Term Life.');
  }

  return {
    carrier: carrier.value,
    productName: product.value,
    productType: productType.value,
    confidence: Math.min(carrier.evidence.confidence, product.evidence.confidence, productType.evidence.confidence),
    evidence: {
      carrier: carrier.evidence,
      productName: product.evidence,
      productType: productType.evidence,
    },
  };
}

function cleanProfileStatus(value?: string): IllustrationProfileStatus {
  if (value === 'draft' || value === 'active' || value === 'archived') return value;
  fail(400, 'invalid_profile_status', 'Illustration profile status is invalid.');
}

function cleanOptionalProfileStatus(value?: string | null) {
  if (value == null || value === '') return null;
  return cleanProfileStatus(value);
}

function cleanTrainingStatus(value?: string): IllustrationTrainingExampleStatus {
  if (value === 'uploaded' || value === 'training' || value === 'needs_review' || value === 'reviewed' || value === 'rejected' || value === 'archived') return value;
  fail(400, 'invalid_training_status', 'Illustration training example status is invalid.');
}

function cleanRunType(value: IllustrationExtractionRunType): IllustrationExtractionRunType {
  if (value === 'admin_train' || value === 'admin_test' || value === 'runtime_extract') return value;
  fail(400, 'invalid_run_type', 'Illustration extraction run type is invalid.');
}

function cleanRunStatus(value: IllustrationExtractionRunStatus): IllustrationExtractionRunStatus {
  if (value === 'pending' || value === 'unsupported_profile' || value === 'needs_review' || value === 'succeeded' || value === 'failed') return value;
  fail(400, 'invalid_run_status', 'Illustration extraction run status is invalid.');
}

function cleanSha256(value?: string | null) {
  const normalized = cleanText(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    fail(400, 'invalid_file_hash', 'PDF file hash must be a 64-character SHA-256 hex digest.');
  }
  return normalized;
}

function cleanOptionalConfidence(value: number | null | undefined, path: string) {
  if (value == null) return null;
  if (!isConfidence(value)) fail(400, 'invalid_confidence', `${path} must be between 0 and 1.`);
  return value;
}

function requiredBoolean(value: unknown) {
  return value === true;
}

function assertSucceededRunExtract(input: StoreIllustrationExtractionRunInput | UpdateIllustrationExtractionRunInput) {
  if (input.status !== 'succeeded' || !input.normalizedExtract) return;
  const validation = validateIllustrationExtract(input.normalizedExtract);
  if (!validation.ok) {
    fail(400, 'invalid_extract', `Illustration extract is invalid: ${validation.issues.map(issue => issue.path).join(', ')}`);
  }
}

function mapProfileRow(row: ProfileRow): IllustrationProfileSummary {
  return {
    id: row.id,
    carrier: row.carrier,
    productName: row.productName,
    productType: row.productType,
    status: row.status,
    notes: row.notes || '',
    carrierLogoUrl: row.carrierLogoUrl ?? null,
    carrierLogoMimeType: row.carrierLogoMimeType ?? null,
    carrierLogoFileName: row.carrierLogoFileName ?? null,
    carrierLogoFileSizeBytes: row.carrierLogoFileSizeBytes == null ? null : Number(row.carrierLogoFileSizeBytes),
    activeVersionId: row.activeVersionId ?? null,
    activeVersionNumber: row.activeVersionNumber == null ? null : Number(row.activeVersionNumber),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapVersionRow(row: VersionRow): IllustrationProfileVersionSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    versionNumber: Number(row.versionNumber),
    status: row.status,
    schemaVersion: Number(row.schemaVersion),
    minMatchScore: Number(row.minMatchScore),
    minExtractionConfidence: Number(row.minExtractionConfidence),
    publishedAt: row.publishedAt == null ? null : timestamp(row.publishedAt),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapFingerprintRow(row: any): IllustrationProfileFingerprint {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId,
    fingerprintType: row.fingerprintType,
    matchStrategy: row.matchStrategy,
    value: row.value,
    pageHint: row.pageHint == null ? null : Number(row.pageHint),
    required: Boolean(row.required),
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    evidenceSnippet: row.evidenceSnippet || '',
  };
}

function mapFieldMappingRow(row: any): IllustrationProfileFieldMapping {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId,
    fieldPath: row.fieldPath,
    sourceStrategy: row.sourceStrategy,
    sourceSelector: row.sourceSelector || {},
    transformRules: row.transformRules || {},
    required: Boolean(row.required),
    minConfidence: Number(row.minConfidence),
    notes: row.notes || '',
  };
}

function mapProjectionMappingRow(row: any): IllustrationProfileProjectionMapping {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId,
    projectionKey: row.projectionKey,
    sourceStrategy: row.sourceStrategy,
    rowSelector: row.rowSelector || {},
    columnMappings: row.columnMappings || {},
    valueMappings: row.valueMappings || {},
    transformRules: row.transformRules || {},
    required: Boolean(row.required),
    minConfidence: Number(row.minConfidence),
    notes: row.notes || '',
  };
}

function mapTrainingExampleRow(row: any): IllustrationTrainingExampleSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId ?? null,
    fileName: row.fileName,
    fileSha256: row.fileSha256,
    mimeType: row.mimeType,
    fileSizeBytes: Number(row.fileSizeBytes),
    status: row.status,
    correctedExtract: row.correctedExtract || {},
    evidenceSnippets: row.evidenceSnippets || {},
    notes: row.notes || '',
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapExtractionRunRow(row: any): IllustrationExtractionRunSummary {
  return {
    id: row.id,
    profileId: row.profileId ?? null,
    profileVersionId: row.profileVersionId ?? null,
    trainingExampleId: row.trainingExampleId ?? null,
    runType: row.runType,
    status: row.status,
    modelProvider: row.modelProvider ?? null,
    modelName: row.modelName ?? null,
    inputSha256: row.inputSha256 ?? null,
    matchScore: row.matchScore == null ? null : Number(row.matchScore),
    extractionConfidence: row.extractionConfidence == null ? null : Number(row.extractionConfidence),
    normalizedExtract: row.normalizedExtract || {},
    evidenceSnippets: row.evidenceSnippets || {},
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    metadata: row.metadata || {},
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

async function assertProfileExists(profileId: string) {
  const sql = db();
  const row = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where id = ${profileId}
    limit 1
  `);
  if (!row) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');
  return row;
}

async function assertProfileVersionBelongsToProfile(profileId: string, profileVersionId?: string | null) {
  if (!profileVersionId) return;
  const sql = db();
  const row = await one<{ id: string }>(sql`
    select id
    from illustration_profile_versions
    where id = ${profileVersionId}
      and profile_id = ${profileId}
    limit 1
  `);
  if (!row) fail(400, 'profile_version_mismatch', 'Illustration profile version does not belong to the profile.');
}

export async function listIllustrationProfiles(search = ''): Promise<IllustrationProfileSummary[]> {
  const sql = db();
  const pattern = `%${search.trim().toLowerCase()}%`;
  const rows = await sql<ProfileRow[]>`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      logo.logo_data_url as "carrierLogoUrl",
      logo.logo_mime_type as "carrierLogoMimeType",
      logo.logo_file_name as "carrierLogoFileName",
      logo.logo_file_size_bytes as "carrierLogoFileSizeBytes",
      av.id as "activeVersionId",
      av.version_number as "activeVersionNumber",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt"
    from illustration_profiles p
    left join lateral (
      select id, version_number
      from illustration_profile_versions
      where profile_id = p.id
        and status = 'published'
      order by published_at desc nulls last, version_number desc
      limit 1
    ) av on true
    left join lateral (
      select logo_data_url, logo_mime_type, logo_file_name, logo_file_size_bytes
      from illustration_carrier_assets
      where lower(carrier) = lower(p.carrier)
      limit 1
    ) logo on true
    where (${search.trim()} = '' or lower(p.carrier) like ${pattern} or lower(p.product_name) like ${pattern})
    order by p.updated_at desc
    limit 200
  `;
  return rows.map(mapProfileRow);
}

export async function getIllustrationProfile(id: string): Promise<IllustrationProfileDetail> {
  const sql = db();
  const profile = await one<ProfileRow>(sql`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      logo.logo_data_url as "carrierLogoUrl",
      logo.logo_mime_type as "carrierLogoMimeType",
      logo.logo_file_name as "carrierLogoFileName",
      logo.logo_file_size_bytes as "carrierLogoFileSizeBytes",
      av.id as "activeVersionId",
      av.version_number as "activeVersionNumber",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt"
    from illustration_profiles p
    left join lateral (
      select id, version_number
      from illustration_profile_versions
      where profile_id = p.id
        and status = 'published'
      order by published_at desc nulls last, version_number desc
      limit 1
    ) av on true
    left join lateral (
      select logo_data_url, logo_mime_type, logo_file_name, logo_file_size_bytes
      from illustration_carrier_assets
      where lower(carrier) = lower(p.carrier)
      limit 1
    ) logo on true
    where p.id = ${id}
    limit 1
  `);
  if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

  const [versions, fingerprints, fieldMappings, projectionMappings, examples, runs] = await Promise.all([
    sql<VersionRow[]>`
      select
        id,
        profile_id as "profileId",
        version_number as "versionNumber",
        status,
        schema_version as "schemaVersion",
        min_match_score as "minMatchScore",
        min_extraction_confidence as "minExtractionConfidence",
        published_at as "publishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from illustration_profile_versions
      where profile_id = ${id}
      order by version_number desc
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        fingerprint_type as "fingerprintType",
        match_strategy as "matchStrategy",
        value,
        page_hint as "pageHint",
        required,
        weight,
        confidence,
        evidence_snippet as "evidenceSnippet"
      from illustration_profile_fingerprints
      where profile_id = ${id}
      order by created_at
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        field_path as "fieldPath",
        source_strategy as "sourceStrategy",
        source_selector as "sourceSelector",
        transform_rules as "transformRules",
        required,
        min_confidence as "minConfidence",
        notes
      from illustration_profile_field_mappings
      where profile_id = ${id}
      order by field_path
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        projection_key as "projectionKey",
        source_strategy as "sourceStrategy",
        row_selector as "rowSelector",
        column_mappings as "columnMappings",
        value_mappings as "valueMappings",
        transform_rules as "transformRules",
        required,
        min_confidence as "minConfidence",
        notes
      from illustration_profile_projection_mappings
      where profile_id = ${id}
      order by projection_key
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        file_name as "fileName",
        file_sha256 as "fileSha256",
        mime_type as "mimeType",
        file_size_bytes as "fileSizeBytes",
        status,
        corrected_extract as "correctedExtract",
        evidence_snippets as "evidenceSnippets",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from illustration_training_examples
      where profile_id = ${id}
      order by created_at desc
      limit 100
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        training_example_id as "trainingExampleId",
        run_type as "runType",
        status,
        model_provider as "modelProvider",
        model_name as "modelName",
        input_sha256 as "inputSha256",
        match_score as "matchScore",
        extraction_confidence as "extractionConfidence",
        normalized_extract as "normalizedExtract",
        evidence_snippets as "evidenceSnippets",
        error_code as "errorCode",
        error_message as "errorMessage",
        metadata,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from illustration_extraction_runs
      where profile_id = ${id}
      order by created_at desc
      limit 100
    `,
  ]);

  const mappedVersions = versions.map(mapVersionRow);
  return {
    ...mapProfileRow(profile),
    versions: mappedVersions,
    draftVersion: mappedVersions.find(version => version.status === 'draft') || null,
    publishedVersion: mappedVersions.find(version => version.status === 'published') || null,
    fingerprints: fingerprints.map(mapFingerprintRow),
    fieldMappings: fieldMappings.map(mapFieldMappingRow),
    projectionMappings: projectionMappings.map(mapProjectionMappingRow),
    examples: examples.map(mapTrainingExampleRow),
    runs: runs.map(mapExtractionRunRow),
  };
}

export async function createIllustrationProfile(actor: Actor, input: CreateIllustrationProfileInput): Promise<IllustrationProfileDetail> {
  const carrier = cleanText(input.carrier);
  const productName = cleanText(input.productName);
  const productType = cleanProductType(input.productType);
  const notes = cleanText(input.notes);
  if (!carrier) fail(400, 'missing_carrier', 'Illustration profile carrier is required.');
  if (!productName) fail(400, 'missing_product_name', 'Illustration profile product name is required.');

  const sql = db();
  const existing = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where lower(carrier) = ${carrier.toLowerCase()}
      and lower(product_name) = ${productName.toLowerCase()}
      and product_type = ${productType}
    limit 1
  `);
  if (existing) fail(409, 'illustration_profile_exists', 'An illustration profile already exists for this carrier and product.');

  const row = await one<{ id: string }>(sql`
    with created_profile as (
      insert into illustration_profiles (carrier, product_name, product_type, status, notes, created_by, updated_by)
      values (${carrier}, ${productName}, ${productType}, 'draft', ${notes}, ${actor.id}, ${actor.id})
      returning id
    )
    insert into illustration_profile_versions (profile_id, version_number, status, schema_version, created_by)
    select id, 1, 'draft', ${ILLUSTRATION_CONTRACT_SCHEMA_VERSION}, ${actor.id}
    from created_profile
    returning profile_id as id
  `);
  if (!row) fail(500, 'illustration_profile_create_failed', 'Could not create illustration profile.');

  await audit(actor, 'illustration_profile.create', 'illustration_profile', row.id, { carrier, productName, productType });
  return await getIllustrationProfile(row.id);
}

export async function upsertIllustrationProfileFromPdf(
  actor: Actor,
  input: {
    pdf: PdfExtractionResult;
    productType?: IllustrationProductType | null;
    notes?: string;
  },
): Promise<UpsertIllustrationProfileFromPdfResult> {
  const identity = extractIllustrationProfileIdentityFromPdf(input.pdf, input.productType ?? null);
  const notes = cleanText(input.notes) || `Created from uploaded PDF ${input.pdf.fileName || input.pdf.fileSha256}.`;
  const sql = db();
  const existing = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where lower(carrier) = ${identity.carrier.toLowerCase()}
      and lower(product_name) = ${identity.productName.toLowerCase()}
      and product_type = ${identity.productType}
    limit 1
  `);

  let created = false;
  const profile = existing
    ? await getIllustrationProfile(existing.id)
    : await createIllustrationProfile(actor, {
        carrier: identity.carrier,
        productName: identity.productName,
        productType: identity.productType,
        notes,
      });
  created = !existing;

  await audit(actor, 'illustration_profile.upsert_from_pdf', 'illustration_profile', profile.id, {
    created,
    carrier: identity.carrier,
    productName: identity.productName,
    productType: identity.productType,
    confidence: identity.confidence,
    fileName: input.pdf.fileName,
    fileSha256: input.pdf.fileSha256,
    pageCount: input.pdf.pageCount,
    extractedPageCount: input.pdf.pages.length,
  });

  return {
    profile,
    identity,
    created,
    file: {
      fileName: input.pdf.fileName || 'illustration.pdf',
      fileSha256: input.pdf.fileSha256,
      fileSizeBytes: input.pdf.fileSizeBytes,
      pageCount: input.pdf.pageCount,
      extractedPageCount: input.pdf.pages.length,
    },
  };
}

export async function updateIllustrationProfile(actor: Actor, id: string, input: UpdateIllustrationProfileInput): Promise<IllustrationProfileDetail> {
  const sql = db();
  const current = await one<{ id: string; carrier: string; productName: string; productType: IllustrationProductType }>(sql`
    select id, carrier, product_name as "productName", product_type as "productType"
    from illustration_profiles
    where id = ${id}
    limit 1
  `);
  if (!current) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

  const carrier = input.carrier != null ? cleanText(input.carrier) : null;
  const productName = input.productName != null ? cleanText(input.productName) : null;
  const productType = input.productType != null ? cleanProductType(input.productType) : null;
  const status = cleanOptionalProfileStatus(input.status || null);
  const notes = input.notes != null ? cleanText(input.notes) : null;
  if (carrier != null && !carrier) fail(400, 'missing_carrier', 'Illustration profile carrier is required.');
  if (productName != null && !productName) fail(400, 'missing_product_name', 'Illustration profile product name is required.');

  const nextCarrier = carrier || current.carrier;
  const nextProductName = productName || current.productName;
  const nextProductType = productType || current.productType;
  const duplicate = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where lower(carrier) = ${nextCarrier.toLowerCase()}
      and lower(product_name) = ${nextProductName.toLowerCase()}
      and product_type = ${nextProductType}
      and id <> ${id}
    limit 1
  `);
  if (duplicate) fail(409, 'illustration_profile_exists', 'An illustration profile already exists for this carrier and product.');

  await sql`
    update illustration_profiles
    set
      carrier = coalesce(${carrier}, carrier),
      product_name = coalesce(${productName}, product_name),
      product_type = coalesce(${productType}, product_type),
      status = coalesce(${status}, status),
      notes = coalesce(${notes}, notes),
      updated_by = ${actor.id},
      updated_at = now()
    where id = ${id}
  `;
  await audit(actor, 'illustration_profile.update', 'illustration_profile', id, input as Record<string, unknown>);
  return await getIllustrationProfile(id);
}

export async function deleteIllustrationProfile(actor: Actor, profileId: string): Promise<{ ok: true }> {
  const sql = db();
  let metadata: Record<string, unknown> | null = null;

  await sql.begin(async (tx: any) => {
    const profile = await one<{ id: string; carrier: string; productName: string; productType: IllustrationProductType }>(tx`
      select id, carrier, product_name as "productName", product_type as "productType"
      from illustration_profiles
      where id = ${profileId}
      limit 1
    `);
    if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

    const counts = await one<{
      versions: number | string;
      trainingExamples: number | string;
      fingerprints: number | string;
      fieldMappings: number | string;
      projectionMappings: number | string;
    }>(tx`
      select
        (select count(*) from illustration_profile_versions where profile_id = ${profileId}) as versions,
        (select count(*) from illustration_training_examples where profile_id = ${profileId}) as "trainingExamples",
        (select count(*) from illustration_profile_fingerprints where profile_id = ${profileId}) as fingerprints,
        (select count(*) from illustration_profile_field_mappings where profile_id = ${profileId}) as "fieldMappings",
        (select count(*) from illustration_profile_projection_mappings where profile_id = ${profileId}) as "projectionMappings"
    `);

    const deletedRuns = await tx<{ id: string }[]>`
      delete from illustration_extraction_runs
      where profile_id = ${profileId}
        or profile_version_id in (
          select id
          from illustration_profile_versions
          where profile_id = ${profileId}
        )
        or training_example_id in (
          select id
          from illustration_training_examples
          where profile_id = ${profileId}
        )
      returning id
    `;

    const deletedProfile = await one<{ id: string }>(tx`
      delete from illustration_profiles
      where id = ${profileId}
      returning id
    `);
    if (!deletedProfile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

    const deletedCarrierLogoAssets = await tx<{ id: string }[]>`
      delete from illustration_carrier_assets asset
      where lower(asset.carrier) = lower(${profile.carrier})
        and not exists (
          select 1
          from illustration_profiles remaining
          where lower(remaining.carrier) = lower(asset.carrier)
        )
      returning id
    `;

    metadata = {
      carrier: profile.carrier,
      productName: profile.productName,
      productType: profile.productType,
      versions: Number(counts?.versions || 0),
      trainingExamples: Number(counts?.trainingExamples || 0),
      fingerprints: Number(counts?.fingerprints || 0),
      fieldMappings: Number(counts?.fieldMappings || 0),
      projectionMappings: Number(counts?.projectionMappings || 0),
      extractionRuns: deletedRuns.length,
      carrierLogoAssets: deletedCarrierLogoAssets.length,
    };
  });

  await audit(actor, 'illustration_profile.delete', 'illustration_profile', profileId, metadata || {});
  return { ok: true };
}

function cleanCarrierLogoInput(input: UpdateIllustrationCarrierLogoInput) {
  const fileName = cleanText(input.fileName) || 'carrier-logo';
  const mimeType = cleanText(input.mimeType);
  const fileSizeBytes = Number(input.fileSizeBytes);
  const dataUrl = cleanText(input.dataUrl);
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
    fail(400, 'invalid_logo_mime_type', 'Carrier logo must be PNG, JPEG, or WebP.');
  }
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes < 1 || fileSizeBytes > MAX_CARRIER_LOGO_FILE_BYTES) {
    fail(400, 'invalid_logo_file_size', 'Carrier logo file size is invalid or too large.');
  }
  if (!dataUrl.startsWith(`data:${mimeType};base64,`) || dataUrl.length > 1048576) {
    fail(400, 'invalid_logo_data', 'Carrier logo data URL is invalid.');
  }
  return { fileName, mimeType, fileSizeBytes, dataUrl };
}

export async function updateIllustrationCarrierLogo(
  actor: Actor,
  profileId: string,
  input: UpdateIllustrationCarrierLogoInput,
): Promise<IllustrationProfileDetail> {
  const clean = cleanCarrierLogoInput(input);
  const sql = db();
  const row = await one<{ id: string }>(sql`
    with current_profile as (
      select id, carrier
      from illustration_profiles
      where id = ${profileId}
      limit 1
    ),
    updated_asset as (
      update illustration_carrier_assets asset
      set
        carrier = current_profile.carrier,
        logo_data_url = ${clean.dataUrl},
        logo_mime_type = ${clean.mimeType},
        logo_file_name = ${clean.fileName},
        logo_file_size_bytes = ${clean.fileSizeBytes},
        updated_by = ${actor.id},
        updated_at = now()
      from current_profile
      where lower(asset.carrier) = lower(current_profile.carrier)
      returning asset.id
    )
    insert into illustration_carrier_assets (
      carrier,
      logo_data_url,
      logo_mime_type,
      logo_file_name,
      logo_file_size_bytes,
      updated_by
    )
    select
      current_profile.carrier,
      ${clean.dataUrl},
      ${clean.mimeType},
      ${clean.fileName},
      ${clean.fileSizeBytes},
      ${actor.id}
    from current_profile
    where not exists (select 1 from updated_asset)
    returning id
  `);

  const profile = await getIllustrationProfile(profileId);
  if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');
  await audit(actor, 'illustration_carrier_logo.update', 'illustration_profile', profileId, {
    carrier: profile.carrier,
    fileName: clean.fileName,
    mimeType: clean.mimeType,
    fileSizeBytes: clean.fileSizeBytes,
    assetCreated: Boolean(row),
  });
  return profile;
}

export async function clearIllustrationCarrierLogo(actor: Actor, profileId: string): Promise<IllustrationProfileDetail> {
  const sql = db();
  const deleted = await sql<{ id: string }[]>`
    delete from illustration_carrier_assets asset
    using illustration_profiles profile
    where profile.id = ${profileId}
      and lower(asset.carrier) = lower(profile.carrier)
    returning asset.id
  `;
  const profile = await getIllustrationProfile(profileId);
  await audit(actor, 'illustration_carrier_logo.clear', 'illustration_profile', profileId, {
    carrier: profile.carrier,
    deleted: deleted.length,
  });
  return profile;
}

export async function ensureDraftIllustrationProfileVersion(actor: Actor, profileId: string): Promise<IllustrationProfileVersionSummary> {
  await assertProfileExists(profileId);
  const sql = db();
  const existing = await one<VersionRow>(sql`
    select
      id,
      profile_id as "profileId",
      version_number as "versionNumber",
      status,
      schema_version as "schemaVersion",
      min_match_score as "minMatchScore",
      min_extraction_confidence as "minExtractionConfidence",
      published_at as "publishedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from illustration_profile_versions
    where profile_id = ${profileId}
      and status = 'draft'
    limit 1
  `);
  if (existing) return mapVersionRow(existing);

  const row = await one<VersionRow>(sql`
    insert into illustration_profile_versions (profile_id, version_number, status, schema_version, created_by)
    values (
      ${profileId},
      (select coalesce(max(version_number), 0) + 1 from illustration_profile_versions where profile_id = ${profileId}),
      'draft',
      ${ILLUSTRATION_CONTRACT_SCHEMA_VERSION},
      ${actor.id}
    )
    returning
      id,
      profile_id as "profileId",
      version_number as "versionNumber",
      status,
      schema_version as "schemaVersion",
      min_match_score as "minMatchScore",
      min_extraction_confidence as "minExtractionConfidence",
      published_at as "publishedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'illustration_profile_version_create_failed', 'Could not create illustration profile version.');
  await audit(actor, 'illustration_profile_version.create_draft', 'illustration_profile', profileId, { versionId: row.id });
  return mapVersionRow(row);
}

export async function publishIllustrationProfileVersion(actor: Actor, profileId: string, profileVersionId: string): Promise<IllustrationProfileDetail> {
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);
  await validatePublishableIllustrationProfileVersion(profileId, profileVersionId);
  const sql = db();
  await sql`
    update illustration_profile_versions
    set status = 'archived', updated_at = now()
    where profile_id = ${profileId}
      and status = 'published'
      and id <> ${profileVersionId}
  `;
  const row = await one<{ id: string }>(sql`
    update illustration_profile_versions
    set
      status = 'published',
      published_at = now(),
      published_by = ${actor.id},
      updated_at = now()
    where id = ${profileVersionId}
      and profile_id = ${profileId}
    returning id
  `);
  if (!row) fail(404, 'illustration_profile_version_not_found', 'Illustration profile version not found.');
  await sql`
    update illustration_profiles
    set status = 'active', updated_by = ${actor.id}, updated_at = now()
    where id = ${profileId}
  `;
  await audit(actor, 'illustration_profile_version.publish', 'illustration_profile', profileId, { versionId: profileVersionId });
  return await getIllustrationProfile(profileId);
}

export async function validatePublishableIllustrationProfileVersion(profileId: string, profileVersionId: string) {
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);
  const sql = db();
  const profile = await one<{ carrier: string; productName: string; productType: IllustrationProductType }>(sql`
    select
      carrier,
      product_name as "productName",
      product_type as "productType"
    from illustration_profiles
    where id = ${profileId}
    limit 1
  `);
  if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

  const [fingerprints, fieldMappings] = await Promise.all([
    listFingerprintsForVersion(profileVersionId),
    listFieldMappingsForVersion(profileVersionId),
  ]);
  const requiredPaths = publishRequiredFieldPaths(profile.productType);
  const missingFieldPaths = requiredPaths.filter(path =>
    !fieldMappings.some(mapping => mapping.fieldPath === path && mapping.required && mapping.sourceStrategy !== 'manual'),
  );
  if (missingFieldPaths.length) {
    fail(400, 'publish_validation_failed', `Missing required field mappings: ${missingFieldPaths.join(', ')}.`);
  }

  const requiredFingerprints = fingerprints.filter(fingerprint => fingerprint.required);
  if (!requiredFingerprints.length) {
    fail(400, 'publish_validation_failed', 'At least one required fingerprint is needed before publishing.');
  }
  const hasCarrierFingerprint = requiredFingerprints.some(fingerprint => fingerprint.fingerprintType === 'carrier');
  const hasNonCarrierFingerprint = requiredFingerprints.some(fingerprint => fingerprint.fingerprintType !== 'carrier');
  if (!hasCarrierFingerprint || !hasNonCarrierFingerprint) {
    fail(400, 'publish_validation_failed', 'Publishing requires required carrier and non-carrier product/form fingerprints.');
  }

  const invalidConfidence = [...fingerprints, ...fieldMappings].find(item => !isConfidence(item.confidence ?? item.minConfidence));
  if (invalidConfidence) {
    fail(400, 'publish_validation_failed', 'Fingerprints and mappings must have confidence values between 0 and 1.');
  }

  const verifiedRun = await one<{ id: string; metadata: JsonObject | null }>(sql`
    select id, metadata
    from illustration_extraction_runs
    where profile_id = ${profileId}
      and profile_version_id = ${profileVersionId}
      and run_type = 'admin_train'
      and training_example_id is not null
    order by updated_at desc, created_at desc
    limit 1
  `);
  const verification = isRecord(verifiedRun?.metadata) ? verifiedRun.metadata.verification : null;
  if (!isRecord(verification) || verification.publishable !== true) {
    fail(
      400,
      'publish_validation_failed',
      'Cannot publish profile because required mappings did not replay successfully on the training PDF.',
    );
  }

  return { ok: true };
}

export async function listPublishedIllustrationProfileVersions(productType?: IllustrationProductType | null): Promise<PublishedIllustrationProfileVersion[]> {
  const cleanType = cleanOptionalProductType(productType || null);
  const sql = db();
  const rows = await sql<Array<ProfileRow & VersionRow & { profileVersionId: string }>>`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      logo.logo_data_url as "carrierLogoUrl",
      logo.logo_mime_type as "carrierLogoMimeType",
      logo.logo_file_name as "carrierLogoFileName",
      logo.logo_file_size_bytes as "carrierLogoFileSizeBytes",
      v.id as "profileVersionId",
      v.version_number as "versionNumber",
      v.status as "versionStatus",
      v.schema_version as "schemaVersion",
      v.min_match_score as "minMatchScore",
      v.min_extraction_confidence as "minExtractionConfidence",
      v.published_at as "publishedAt",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
      v.created_at as "versionCreatedAt",
      v.updated_at as "versionUpdatedAt"
    from illustration_profiles p
    join illustration_profile_versions v on v.profile_id = p.id
    left join lateral (
      select logo_data_url, logo_mime_type, logo_file_name, logo_file_size_bytes
      from illustration_carrier_assets
      where lower(carrier) = lower(p.carrier)
      limit 1
    ) logo on true
    where p.status = 'active'
      and v.status = 'published'
      and (${cleanType || ''} = '' or p.product_type = ${cleanType})
    order by p.carrier, p.product_name, v.published_at desc nulls last, v.version_number desc
  `;

  return rows.map(row => ({
    profile: mapProfileRow({ ...row, activeVersionId: row.profileVersionId, activeVersionNumber: row.versionNumber }),
    version: mapVersionRow({
      id: row.profileVersionId,
      profileId: row.id,
      versionNumber: row.versionNumber,
      status: row.versionStatus as IllustrationProfileVersionStatus,
      schemaVersion: row.schemaVersion,
      minMatchScore: row.minMatchScore,
      minExtractionConfidence: row.minExtractionConfidence,
      publishedAt: row.publishedAt,
      createdAt: (row as any).versionCreatedAt,
      updatedAt: (row as any).versionUpdatedAt,
    }),
    fingerprints: [],
    fieldMappings: [],
    projectionMappings: [],
  }));
}

export async function listPublishedIllustrationProfileVersionDetails(productType?: IllustrationProductType | null): Promise<PublishedIllustrationProfileVersion[]> {
  const summaries = await listPublishedIllustrationProfileVersions(productType);
  const details = await Promise.all(summaries.map(summary => getPublishedIllustrationProfileVersion(summary.profile.id)));
  return details.filter((detail): detail is PublishedIllustrationProfileVersion => Boolean(detail));
}

export async function getPublishedIllustrationProfileVersion(profileId: string): Promise<PublishedIllustrationProfileVersion | null> {
  const sql = db();
  const row = await one<any>(sql`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      logo.logo_data_url as "carrierLogoUrl",
      logo.logo_mime_type as "carrierLogoMimeType",
      logo.logo_file_name as "carrierLogoFileName",
      logo.logo_file_size_bytes as "carrierLogoFileSizeBytes",
      v.id as "profileVersionId",
      v.version_number as "versionNumber",
      v.status as "versionStatus",
      v.schema_version as "schemaVersion",
      v.min_match_score as "minMatchScore",
      v.min_extraction_confidence as "minExtractionConfidence",
      v.published_at as "publishedAt",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
      v.created_at as "versionCreatedAt",
      v.updated_at as "versionUpdatedAt"
    from illustration_profiles p
    join illustration_profile_versions v on v.profile_id = p.id
    left join lateral (
      select logo_data_url, logo_mime_type, logo_file_name, logo_file_size_bytes
      from illustration_carrier_assets
      where lower(carrier) = lower(p.carrier)
      limit 1
    ) logo on true
    where p.id = ${profileId}
      and p.status = 'active'
      and v.status = 'published'
    order by v.published_at desc nulls last, v.version_number desc
    limit 1
  `);
  if (!row) return null;

  const [fingerprints, fieldMappings, projectionMappings] = await Promise.all([
    listFingerprintsForVersion(row.profileVersionId),
    listFieldMappingsForVersion(row.profileVersionId),
    listProjectionMappingsForVersion(row.profileVersionId),
  ]);

  return {
    profile: mapProfileRow({ ...row, activeVersionId: row.profileVersionId, activeVersionNumber: row.versionNumber }),
    version: mapVersionRow({
      id: row.profileVersionId,
      profileId: row.id,
      versionNumber: row.versionNumber,
      status: row.versionStatus,
      schemaVersion: row.schemaVersion,
      minMatchScore: row.minMatchScore,
      minExtractionConfidence: row.minExtractionConfidence,
      publishedAt: row.publishedAt,
      createdAt: row.versionCreatedAt,
      updatedAt: row.versionUpdatedAt,
    }),
    fingerprints,
    fieldMappings,
    projectionMappings,
  };
}

export async function listFingerprintsForVersion(profileVersionId: string): Promise<IllustrationProfileFingerprint[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      fingerprint_type as "fingerprintType",
      match_strategy as "matchStrategy",
      value,
      page_hint as "pageHint",
      required,
      weight,
      confidence,
      evidence_snippet as "evidenceSnippet"
    from illustration_profile_fingerprints
    where profile_version_id = ${profileVersionId}
    order by required desc, weight desc, created_at
  `;
  return rows.map(mapFingerprintRow);
}

export async function listFieldMappingsForVersion(profileVersionId: string): Promise<IllustrationProfileFieldMapping[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      field_path as "fieldPath",
      source_strategy as "sourceStrategy",
      source_selector as "sourceSelector",
      transform_rules as "transformRules",
      required,
      min_confidence as "minConfidence",
      notes
    from illustration_profile_field_mappings
    where profile_version_id = ${profileVersionId}
    order by required desc, field_path
  `;
  return rows.map(mapFieldMappingRow);
}

export async function listProjectionMappingsForVersion(profileVersionId: string): Promise<IllustrationProfileProjectionMapping[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      projection_key as "projectionKey",
      source_strategy as "sourceStrategy",
      row_selector as "rowSelector",
      column_mappings as "columnMappings",
      value_mappings as "valueMappings",
      transform_rules as "transformRules",
      required,
      min_confidence as "minConfidence",
      notes
    from illustration_profile_projection_mappings
    where profile_version_id = ${profileVersionId}
    order by required desc, projection_key
  `;
  return rows.map(mapProjectionMappingRow);
}

export async function storeIllustrationTrainingExample(
  actor: Actor,
  profileId: string,
  input: StoreIllustrationTrainingExampleInput,
): Promise<IllustrationTrainingExampleSummary> {
  await assertProfileExists(profileId);
  const profileVersionId = input.profileVersionId ?? (await ensureDraftIllustrationProfileVersion(actor, profileId)).id;
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);

  const fileName = cleanText(input.fileName);
  const fileSha256 = cleanSha256(input.fileSha256);
  const status = cleanTrainingStatus(input.status || 'uploaded');
  if (!fileName) fail(400, 'missing_file_name', 'Training example file name is required.');
  if (input.mimeType !== 'application/pdf') fail(400, 'invalid_mime_type', 'Training examples must be PDF files.');
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes < 1) fail(400, 'invalid_file_size', 'Training example file size is invalid.');

  const sql = db();
  const row = await one<any>(sql`
    insert into illustration_training_examples (
      profile_id,
      profile_version_id,
      file_name,
      file_sha256,
      mime_type,
      file_size_bytes,
      status,
      corrected_extract,
      evidence_snippets,
      notes,
      uploaded_by
    ) values (
      ${profileId},
      ${profileVersionId},
      ${fileName},
      ${fileSha256},
      ${input.mimeType},
      ${input.fileSizeBytes},
      ${status},
      (${jsonPayload(input.correctedExtract)}::text)::jsonb,
      (${jsonPayload(input.evidenceSnippets)}::text)::jsonb,
      ${cleanText(input.notes)},
      ${actor.id}
    )
    on conflict (profile_id, file_sha256) do update set
      profile_version_id = coalesce(excluded.profile_version_id, illustration_training_examples.profile_version_id),
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      status = excluded.status,
      corrected_extract = case
        when excluded.corrected_extract = '{}'::jsonb then illustration_training_examples.corrected_extract
        else excluded.corrected_extract
      end,
      evidence_snippets = case
        when excluded.evidence_snippets = '{}'::jsonb then illustration_training_examples.evidence_snippets
        else excluded.evidence_snippets
      end,
      notes = coalesce(nullif(excluded.notes, ''), illustration_training_examples.notes),
      updated_at = now()
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      file_name as "fileName",
      file_sha256 as "fileSha256",
      mime_type as "mimeType",
      file_size_bytes as "fileSizeBytes",
      status,
      corrected_extract as "correctedExtract",
      evidence_snippets as "evidenceSnippets",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'training_example_store_failed', 'Could not store illustration training example.');

  await audit(actor, 'illustration_training_example.store', 'illustration_profile', profileId, {
    exampleId: row.id,
    fileSha256,
    profileVersionId,
  });
  return mapTrainingExampleRow(row);
}

async function getTrainingExampleForProfile(profileId: string, exampleId: string) {
  const sql = db();
  const row = await one<any>(sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      file_name as "fileName",
      file_sha256 as "fileSha256",
      mime_type as "mimeType",
      file_size_bytes as "fileSizeBytes",
      status,
      corrected_extract as "correctedExtract",
      evidence_snippets as "evidenceSnippets",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from illustration_training_examples
    where id = ${exampleId}
      and profile_id = ${profileId}
    limit 1
  `);
  if (!row) fail(404, 'training_example_not_found', 'Illustration training example not found.');
  return mapTrainingExampleRow(row);
}

export async function updateIllustrationTrainingExample(
  actor: Actor,
  profileId: string,
  exampleId: string,
  input: UpdateIllustrationTrainingExampleInput,
): Promise<IllustrationTrainingExampleSummary> {
  const current = await getTrainingExampleForProfile(profileId, exampleId);
  const profileVersionId = input.profileVersionId ?? current.profileVersionId;
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);

  const status = input.status ? cleanTrainingStatus(input.status) : 'reviewed';
  const notes = input.notes != null ? cleanText(input.notes) : null;
  const sql = db();
  const row = await one<any>(sql`
    update illustration_training_examples
    set
      profile_version_id = coalesce(${profileVersionId || null}, profile_version_id),
      status = ${status},
      corrected_extract = coalesce((${jsonPayloadOrNull(input.correctedExtract)}::text)::jsonb, corrected_extract),
      evidence_snippets = coalesce((${jsonPayloadOrNull(input.evidenceSnippets)}::text)::jsonb, evidence_snippets),
      notes = coalesce(${notes}, notes),
      updated_at = now()
    where id = ${exampleId}
      and profile_id = ${profileId}
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      file_name as "fileName",
      file_sha256 as "fileSha256",
      mime_type as "mimeType",
      file_size_bytes as "fileSizeBytes",
      status,
      corrected_extract as "correctedExtract",
      evidence_snippets as "evidenceSnippets",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'training_example_update_failed', 'Could not update illustration training example.');
  await audit(actor, 'illustration_training_example.update', 'illustration_profile', profileId, {
    exampleId,
    profileVersionId,
    status,
  });
  return mapTrainingExampleRow(row);
}

export async function replaceIllustrationProfileVersionMappings(
  actor: Actor,
  profileId: string,
  profileVersionId: string,
  input: Pick<IllustrationTrainingCorrectionInput, 'fingerprints' | 'fieldMappings' | 'projectionMappings' | 'correctedExtract' | 'evidenceSnippets'>,
) {
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);
  const sql = db();
  const profile = await one<{ carrier: string; productName: string; productType: IllustrationProductType }>(sql`
    select
      carrier,
      product_name as "productName",
      product_type as "productType"
    from illustration_profiles
    where id = ${profileId}
    limit 1
  `);
  if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');
  const fieldMappings = input.fieldMappings
    ? completeReviewedFieldMappings(profile.productType, input)
    : undefined;
  const fingerprints = input.fingerprints
    ? dedupeIllustrationProfileFingerprintsForStorage(input.fingerprints, profile)
    : undefined;

  if (fingerprints) {
    await sql`delete from illustration_profile_fingerprints where profile_id = ${profileId} and profile_version_id = ${profileVersionId}`;
    for (const fingerprint of fingerprints) {
      await sql`
        insert into illustration_profile_fingerprints (
          profile_id,
          profile_version_id,
          fingerprint_type,
          match_strategy,
          value,
          page_hint,
          required,
          weight,
          confidence,
          evidence_snippet
        ) values (
          ${profileId},
          ${profileVersionId},
          ${fingerprint.fingerprintType},
          ${fingerprint.matchStrategy},
          ${cleanText(fingerprint.value)},
          ${fingerprint.pageHint ?? null},
          ${requiredBoolean(fingerprint.required)},
          ${fingerprint.weight ?? 1},
          ${fingerprint.confidence ?? 1},
          ${fingerprint.evidenceSnippet || ''}
        )
      `;
    }
  }

  if (fieldMappings) {
    await sql`delete from illustration_profile_field_mappings where profile_id = ${profileId} and profile_version_id = ${profileVersionId}`;
    for (const mapping of fieldMappings) {
      await sql`
        insert into illustration_profile_field_mappings (
          profile_id,
          profile_version_id,
          field_path,
          source_strategy,
          source_selector,
          transform_rules,
          required,
          min_confidence,
          notes
        ) values (
          ${profileId},
          ${profileVersionId},
          ${mapping.fieldPath},
          ${mapping.sourceStrategy},
          (${jsonPayload(mapping.sourceSelector)}::text)::jsonb,
          (${jsonPayload(mapping.transformRules)}::text)::jsonb,
          ${requiredBoolean(mapping.required)},
          ${mapping.minConfidence ?? 0.8},
          ${mapping.notes || ''}
        )
      `;
    }
  }

  if (input.projectionMappings) {
    await sql`delete from illustration_profile_projection_mappings where profile_id = ${profileId} and profile_version_id = ${profileVersionId}`;
    for (const mapping of input.projectionMappings.map(sanitizeRuntimeProjectionMapping)) {
      await sql`
        insert into illustration_profile_projection_mappings (
          profile_id,
          profile_version_id,
          projection_key,
          source_strategy,
          row_selector,
          column_mappings,
          value_mappings,
          transform_rules,
          required,
          min_confidence,
          notes
        ) values (
          ${profileId},
          ${profileVersionId},
          ${mapping.projectionKey},
          ${mapping.sourceStrategy},
          (${jsonPayload(mapping.rowSelector)}::text)::jsonb,
          (${jsonPayload(mapping.columnMappings)}::text)::jsonb,
          (${jsonPayload(mapping.valueMappings)}::text)::jsonb,
          (${jsonPayload(mapping.transformRules)}::text)::jsonb,
          ${requiredBoolean(mapping.required)},
          ${mapping.minConfidence ?? 0.8},
          ${mapping.notes || ''}
        )
      `;
    }
  }

  await sql`
    update illustration_profile_versions
    set updated_at = now()
    where id = ${profileVersionId}
      and profile_id = ${profileId}
  `;
  await sql`
    update illustration_profiles
    set updated_by = ${actor.id}, updated_at = now()
    where id = ${profileId}
  `;
  await audit(actor, 'illustration_profile_mappings.replace', 'illustration_profile', profileId, {
    profileVersionId,
    fingerprints: fingerprints?.length,
    fieldMappings: fieldMappings?.length,
    projectionMappings: input.projectionMappings?.length,
  });
}

async function latestTrainingRunForExample(profileId: string, exampleId: string) {
  const sql = db();
  return await one<{ id: string; metadata: JsonObject | null }>(sql`
    select id, metadata
    from illustration_extraction_runs
    where profile_id = ${profileId}
      and training_example_id = ${exampleId}
      and run_type = 'admin_train'
    order by created_at desc
    limit 1
  `);
}

async function updateTrainingRunVerification(
  profileId: string,
  profileVersionId: string,
  example: IllustrationTrainingExampleSummary,
) {
  const run = await latestTrainingRunForExample(profileId, example.id);
  const metadata = run?.metadata && typeof run.metadata === 'object' && !Array.isArray(run.metadata)
    ? run.metadata
    : {};
  const pdf = pdfFromTrainingReplaySnapshot((metadata as Record<string, unknown>).trainingPdf);
  if (!run || !pdf || !example.correctedExtract || !isRecord(example.correctedExtract)) return null;

  const fieldMappings = await listFieldMappingsForVersion(profileVersionId);
  const verification = verifyIllustrationTrainingMappings(
    pdf,
    example.correctedExtract as IllustrationExtract,
    fieldMappings,
  );
  const reviewProposal = isRecord((metadata as Record<string, unknown>).reviewProposal)
    ? {
        ...((metadata as Record<string, unknown>).reviewProposal as Record<string, unknown>),
        normalizedExtract: example.correctedExtract,
        fieldMappings,
        verification,
      }
    : undefined;

  await updateIllustrationExtractionRun(run.id, {
    status: verification.publishable ? 'succeeded' : 'needs_review',
    normalizedExtract: example.correctedExtract,
    evidenceSnippets: example.evidenceSnippets,
    metadata: {
      ...metadata,
      verification,
      ...(reviewProposal ? { reviewProposal } : {}),
    },
  });
  return verification;
}

export async function getIllustrationTrainingReplayContext(profileId: string, exampleId: string) {
  const example = await getTrainingExampleForProfile(profileId, exampleId);
  const run = await latestTrainingRunForExample(profileId, exampleId);
  const metadata = run?.metadata && typeof run.metadata === 'object' && !Array.isArray(run.metadata)
    ? run.metadata
    : {};
  const pdf = pdfFromTrainingReplaySnapshot((metadata as Record<string, unknown>).trainingPdf);
  if (!run || !pdf) {
    fail(400, 'training_replay_unavailable', 'Training PDF replay data is not available. Run Train sample again.');
  }
  return {
    example,
    runId: run.id,
    metadata,
    pdf,
  };
}

export async function applyIllustrationTrainingCorrection(
  actor: Actor,
  profileId: string,
  exampleId: string,
  input: IllustrationTrainingCorrectionInput,
) {
  const current = await getTrainingExampleForProfile(profileId, exampleId);
  const profileVersionId = input.profileVersionId ?? current.profileVersionId ?? (await ensureDraftIllustrationProfileVersion(actor, profileId)).id;
  if (input.fingerprints || input.fieldMappings || input.projectionMappings) {
    await replaceIllustrationProfileVersionMappings(actor, profileId, profileVersionId, input);
  }
  const example = await updateIllustrationTrainingExample(actor, profileId, exampleId, {
    ...input,
    profileVersionId,
    status: input.status || 'reviewed',
  });
  const verification = input.fieldMappings
    ? await updateTrainingRunVerification(profileId, profileVersionId, example)
    : null;
  return {
    example,
    profile: await getIllustrationProfile(profileId),
    verification,
  };
}

export async function recordIllustrationExtractionRun(input: StoreIllustrationExtractionRunInput): Promise<IllustrationExtractionRunSummary> {
  assertSucceededRunExtract(input);
  const runType = cleanRunType(input.runType);
  const status = cleanRunStatus(input.status);
  const inputSha256 = input.inputSha256 ? cleanSha256(input.inputSha256) : null;
  const matchScore = cleanOptionalConfidence(input.matchScore, 'matchScore');
  const extractionConfidence = cleanOptionalConfidence(input.extractionConfidence, 'extractionConfidence');

  const sql = db();
  const row = await one<any>(sql`
    insert into illustration_extraction_runs (
      profile_id,
      profile_version_id,
      training_example_id,
      run_type,
      status,
      model_provider,
      model_name,
      input_sha256,
      match_score,
      extraction_confidence,
      normalized_extract,
      evidence_snippets,
      error_code,
      error_message,
      metadata,
      created_by
    ) values (
      ${input.profileId || null},
      ${input.profileVersionId || null},
      ${input.trainingExampleId || null},
      ${runType},
      ${status},
      ${input.modelProvider || null},
      ${input.modelName || null},
      ${inputSha256},
      ${matchScore},
      ${extractionConfidence},
      (${jsonPayload(input.normalizedExtract)}::text)::jsonb,
      (${jsonPayload(input.evidenceSnippets)}::text)::jsonb,
      ${input.errorCode || null},
      ${input.errorMessage || null},
      (${jsonPayload(input.metadata)}::text)::jsonb,
      ${input.createdBy || null}
    )
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      training_example_id as "trainingExampleId",
      run_type as "runType",
      status,
      model_provider as "modelProvider",
      model_name as "modelName",
      input_sha256 as "inputSha256",
      match_score as "matchScore",
      extraction_confidence as "extractionConfidence",
      normalized_extract as "normalizedExtract",
      evidence_snippets as "evidenceSnippets",
      error_code as "errorCode",
      error_message as "errorMessage",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'extraction_run_store_failed', 'Could not store illustration extraction run.');
  return mapExtractionRunRow(row);
}

export async function updateIllustrationExtractionRun(
  id: string,
  input: UpdateIllustrationExtractionRunInput,
): Promise<IllustrationExtractionRunSummary> {
  assertSucceededRunExtract(input);
  const status = input.status ? cleanRunStatus(input.status) : null;
  const matchScore = cleanOptionalConfidence(input.matchScore, 'matchScore');
  const extractionConfidence = cleanOptionalConfidence(input.extractionConfidence, 'extractionConfidence');
  const sql = db();
  const row = await one<any>(sql`
    update illustration_extraction_runs
    set
      profile_id = coalesce(${input.profileId ?? null}, profile_id),
      profile_version_id = coalesce(${input.profileVersionId ?? null}, profile_version_id),
      training_example_id = coalesce(${input.trainingExampleId ?? null}, training_example_id),
      status = coalesce(${status}, status),
      model_provider = coalesce(${input.modelProvider ?? null}, model_provider),
      model_name = coalesce(${input.modelName ?? null}, model_name),
      match_score = coalesce(${matchScore}, match_score),
      extraction_confidence = coalesce(${extractionConfidence}, extraction_confidence),
      normalized_extract = coalesce((${jsonPayloadOrNull(input.normalizedExtract)}::text)::jsonb, normalized_extract),
      evidence_snippets = coalesce((${jsonPayloadOrNull(input.evidenceSnippets)}::text)::jsonb, evidence_snippets),
      error_code = coalesce(${input.errorCode ?? null}, error_code),
      error_message = coalesce(${input.errorMessage ?? null}, error_message),
      metadata = coalesce((${jsonPayloadOrNull(input.metadata)}::text)::jsonb, metadata),
      updated_at = now()
    where id = ${id}
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      training_example_id as "trainingExampleId",
      run_type as "runType",
      status,
      model_provider as "modelProvider",
      model_name as "modelName",
      input_sha256 as "inputSha256",
      match_score as "matchScore",
      extraction_confidence as "extractionConfidence",
      normalized_extract as "normalizedExtract",
      evidence_snippets as "evidenceSnippets",
      error_code as "errorCode",
      error_message as "errorMessage",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(404, 'extraction_run_not_found', 'Illustration extraction run not found.');
  return mapExtractionRunRow(row);
}

export async function listIllustrationExtractionRuns(profileId?: string): Promise<IllustrationExtractionRunSummary[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      training_example_id as "trainingExampleId",
      run_type as "runType",
      status,
      model_provider as "modelProvider",
      model_name as "modelName",
      input_sha256 as "inputSha256",
      match_score as "matchScore",
      extraction_confidence as "extractionConfidence",
      normalized_extract as "normalizedExtract",
      evidence_snippets as "evidenceSnippets",
      error_code as "errorCode",
      error_message as "errorMessage",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from illustration_extraction_runs
    where (${profileId || ''} = '' or profile_id = ${profileId || null})
    order by created_at desc
    limit 200
  `;
  return rows.map(mapExtractionRunRow);
}

export function extractionRunStatusForRuntime(status: IllustrationRuntimeExtractStatus) {
  return extractionRunStatusForRuntimeStatus(status);
}
