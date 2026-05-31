import { expect, test } from 'bun:test';
import { textContainsFingerprintValue } from './illustrationMatching';

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
