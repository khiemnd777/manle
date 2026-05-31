import { expect, test } from 'bun:test';
import {
  evaluateFingerprint,
  textContainsFingerprintValue,
  textNormalizedContainsFingerprintValue,
} from './illustrationMatching';
import type { IllustrationProfileFingerprint, PdfExtractionResult } from '../types/illustration';

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
