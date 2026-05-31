import { expect, test } from 'bun:test';
import type { IllustrationProfileFingerprint } from '../types/illustration';
import { dedupeIllustrationProfileFingerprintsForStorage } from './illustrations';

test('deduplicates fingerprints by the database storage key', () => {
  const fingerprints: IllustrationProfileFingerprint[] = [
    {
      fingerprintType: 'carrier',
      matchStrategy: 'contains',
      value: ' Life Insurance Company of the Southwest ',
      pageHint: 1,
      required: true,
      weight: 1,
      confidence: 0.9,
      evidenceSnippet: 'page 1 carrier',
    },
    {
      fingerprintType: 'carrier',
      matchStrategy: 'contains',
      value: 'Life Insurance Company of the Southwest',
      pageHint: 4,
      required: true,
      weight: 0.8,
      confidence: 0.95,
      evidenceSnippet: 'page 4 carrier',
    },
    {
      fingerprintType: 'product',
      matchStrategy: 'contains',
      value: 'FlexLife',
      pageHint: 1,
      required: true,
      weight: 1,
      confidence: 0.9,
      evidenceSnippet: 'page 1 product',
    },
  ];

  const result = dedupeIllustrationProfileFingerprintsForStorage(fingerprints);
  const carrier = result.find(fingerprint => fingerprint.fingerprintType === 'carrier');

  expect(result).toHaveLength(2);
  expect(carrier?.value).toBe('Life Insurance Company of the Southwest');
  expect(carrier?.pageHint).toBe(null);
  expect(carrier?.confidence).toBe(0.95);
  expect(carrier?.evidenceSnippet).toBe('page 4 carrier');
});

test('keeps a shared page hint when duplicate fingerprints point to the same page', () => {
  const result = dedupeIllustrationProfileFingerprintsForStorage([
    {
      fingerprintType: 'product',
      matchStrategy: 'contains',
      value: 'FlexLife',
      pageHint: 1,
      required: false,
      weight: 0.8,
      confidence: 0.7,
      evidenceSnippet: '',
    },
    {
      fingerprintType: 'product',
      matchStrategy: 'contains',
      value: 'FlexLife',
      pageHint: 1,
      required: true,
      weight: 1,
      confidence: 0.9,
      evidenceSnippet: 'page 1 product',
    },
  ]);

  expect(result).toHaveLength(1);
  expect(result[0]?.pageHint).toBe(1);
  expect(result[0]?.required).toBe(true);
  expect(result[0]?.weight).toBe(1);
  expect(result[0]?.confidence).toBe(0.9);
  expect(result[0]?.evidenceSnippet).toBe('page 1 product');
});
