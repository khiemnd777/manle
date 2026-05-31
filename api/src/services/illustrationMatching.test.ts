import { expect, test } from 'bun:test';
import {
  candidateForProfile,
  evaluateFingerprint,
  textContainsFingerprintValue,
  textNormalizedContainsFingerprintValue,
} from './illustrationMatching';
import type { PublishedIllustrationProfileVersion } from './illustrations';
import type { IllustrationProfileFingerprint, PdfExtractionResult } from '../types/illustration';

function pdf(text: string): PdfExtractionResult {
  const lines = text.split('\n').map((line, index) => ({
    page: 1,
    text: line,
    y: index,
    items: [],
  }));
  return {
    fileName: 'runtime.pdf',
    fileSha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    fileSizeBytes: 100,
    pageCount: 1,
    text,
    pages: [{ page: 1, text, lines, items: [] }],
  };
}

function publishedProfile(fingerprints: IllustrationProfileFingerprint[]): PublishedIllustrationProfileVersion {
  return {
    profile: {
      id: 'profile',
      carrier: 'Transamerica Life Insurance Company',
      productName: 'Transamerica Financial Foundation IUL II',
      productType: 'iul',
      status: 'active',
      notes: '',
      activeVersionId: 'version',
      activeVersionNumber: 1,
      createdAt: '',
      updatedAt: '',
    },
    version: {
      id: 'version',
      profileId: 'profile',
      versionNumber: 1,
      status: 'published',
      schemaVersion: 1,
      minMatchScore: 0.8,
      minExtractionConfidence: 0.8,
      publishedAt: '',
      createdAt: '',
      updatedAt: '',
    },
    fingerprints,
    fieldMappings: [],
    projectionMappings: [],
  };
}

function fingerprint(input: Partial<IllustrationProfileFingerprint> & Pick<IllustrationProfileFingerprint, 'fingerprintType' | 'value'>): IllustrationProfileFingerprint {
  return {
    id: `${input.fingerprintType}:${input.value}`,
    fingerprintType: input.fingerprintType,
    matchStrategy: input.matchStrategy || 'contains',
    value: input.value,
    pageHint: input.pageHint ?? null,
    required: input.required ?? false,
    weight: input.weight ?? 1,
    confidence: input.confidence ?? 1,
    evidenceSnippet: input.evidenceSnippet || input.value,
  };
}

test('contains fingerprints match PDF text across line breaks', () => {
  const pdfText = [
    'TRANSAMERICA TRENDSETTER LB 20',
    'Guaranteed Level Term Life Insurance with Living Benefits',
    'Transamerica Life Insurance Company',
  ].join('\n');

  expect(textContainsFingerprintValue(
    pdfText,
    'TRANSAMERICA TRENDSETTER LB 20 Guaranteed Level Term Life Insurance',
  )).toBe(true);
  expect(textContainsFingerprintValue(
    pdfText,
    'Transamerica Life Insurance Company',
  )).toBe(true);
});

test('contains fingerprints still reject absent values', () => {
  expect(textContainsFingerprintValue(
    'TRANSAMERICA TRENDSETTER LB 20',
    'Life Insurance Company of the Southwest',
  )).toBe(false);
});

test('normalized contains fingerprints match compacted PDF text across line breaks', () => {
  const pdfText = [
    'TRANSAMERICA TRENDSETTER LB 20',
    'Guaranteed Level Term Life Insurance with Living Benefits',
  ].join('\n');

  expect(textNormalizedContainsFingerprintValue(
    pdfText,
    'Transamerica Trendsetter LB 20 - Guaranteed Level Term Life Insurance',
  )).toBe(true);
});

test('fingerprint page hints fall back to the full PDF when the hinted page misses', () => {
  const fingerprint: IllustrationProfileFingerprint = {
    fingerprintType: 'product',
    matchStrategy: 'normalized_contains',
    value: 'Transamerica Trendsetter LB 20 Guaranteed Level Term Life Insurance',
    pageHint: 1,
    required: true,
    weight: 1,
    confidence: 0.9,
  };
  const pdf = {
    text: [
      'Cover page',
      'TRANSAMERICA TRENDSETTER LB 20\nGuaranteed Level Term Life Insurance with Living Benefits',
    ].join('\n'),
    pages: [
      { page: 1, text: 'Cover page', lines: [{ page: 1, text: 'Cover page' }], items: [] },
      {
        page: 2,
        text: 'TRANSAMERICA TRENDSETTER LB 20\nGuaranteed Level Term Life Insurance with Living Benefits',
        lines: [
          { page: 2, text: 'TRANSAMERICA TRENDSETTER LB 20' },
          { page: 2, text: 'Guaranteed Level Term Life Insurance with Living Benefits' },
        ],
        items: [],
      },
    ],
  } as PdfExtractionResult;

  const result = evaluateFingerprint(fingerprint, pdf);

  expect(result.matched).toBe(true);
  expect(result.evidence?.page).toBe(2);
});

test('optional form and version fingerprints do not lower runtime match score', () => {
  const candidate = candidateForProfile(
    publishedProfile([
      fingerprint({
        fingerprintType: 'carrier',
        matchStrategy: 'equals',
        value: 'Transamerica Life Insurance Company',
        required: true,
        confidence: 0.99,
      }),
      fingerprint({
        fingerprintType: 'product',
        matchStrategy: 'contains',
        value: 'TRANSAMERICA FINANCIAL FOUNDATION IUL II',
        required: true,
        confidence: 0.98,
      }),
      fingerprint({
        fingerprintType: 'form',
        matchStrategy: 'equals',
        value: 'ICC24 TPIU12IC-0224',
        required: false,
        weight: 0.8,
        confidence: 0.95,
      }),
      fingerprint({
        fingerprintType: 'version',
        matchStrategy: 'equals',
        value: '3.16.6',
        required: false,
        weight: 0.8,
        confidence: 0.95,
      }),
    ]),
    pdf([
      'Transamerica Life Insurance Company',
      '05/26 ® TRANSAMERICA FINANCIAL FOUNDATION IUL II Flexible Premium Adjustable Life Insurance',
    ].join('\n')),
  );

  expect(candidate?.requiredMatched).toBe(true);
  expect(candidate?.requiredFingerprintCount).toBe(2);
  expect(candidate?.matchedRequiredFingerprintCount).toBe(2);
  expect(candidate?.totalFingerprintCount).toBe(4);
  expect(candidate?.matchedFingerprintCount).toBe(2);
  expect(candidate?.score).toBeGreaterThanOrEqual(0.98);
});

test('required product fingerprint still gates runtime matching', () => {
  const candidate = candidateForProfile(
    publishedProfile([
      fingerprint({
        fingerprintType: 'carrier',
        matchStrategy: 'equals',
        value: 'Transamerica Life Insurance Company',
        required: true,
        confidence: 0.99,
      }),
      fingerprint({
        fingerprintType: 'product',
        matchStrategy: 'contains',
        value: 'TRANSAMERICA FINANCIAL FOUNDATION IUL II',
        required: true,
        confidence: 0.98,
      }),
    ]),
    pdf('Transamerica Life Insurance Company'),
  );

  expect(candidate?.requiredMatched).toBe(false);
  expect(candidate?.matchedRequiredFingerprintCount).toBe(1);
  expect(candidate?.score).toBeLessThan(0.8);
});
