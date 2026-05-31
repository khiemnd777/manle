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

test('stores only carrier and product fingerprints as required runtime gates', () => {
  const result = dedupeIllustrationProfileFingerprintsForStorage([
    {
      fingerprintType: 'carrier',
      matchStrategy: 'equals',
      value: 'Transamerica Life Insurance Company',
      pageHint: 1,
      required: false,
      weight: 1,
      confidence: 0.99,
      evidenceSnippet: '',
    },
    {
      fingerprintType: 'product',
      matchStrategy: 'contains',
      value: 'TRANSAMERICA FINANCIAL FOUNDATION IUL II',
      pageHint: 1,
      required: false,
      weight: 1,
      confidence: 0.98,
      evidenceSnippet: '',
    },
    {
      fingerprintType: 'form',
      matchStrategy: 'equals',
      value: 'ICC24 TPIU12IC-0224',
      pageHint: 1,
      required: true,
      weight: 0.8,
      confidence: 0.95,
      evidenceSnippet: '',
    },
    {
      fingerprintType: 'version',
      matchStrategy: 'equals',
      value: '3.16.6',
      pageHint: 2,
      required: true,
      weight: 0.8,
      confidence: 0.95,
      evidenceSnippet: '',
    },
  ]);

  expect(result.find(item => item.fingerprintType === 'carrier')?.required).toBe(true);
  expect(result.find(item => item.fingerprintType === 'product')?.required).toBe(true);
  expect(result.find(item => item.fingerprintType === 'form')?.required).toBe(false);
  expect(result.find(item => item.fingerprintType === 'version')?.required).toBe(false);
});

test('canonicalizes required identity fingerprints to stable profile values', () => {
  const result = dedupeIllustrationProfileFingerprintsForStorage([
    {
      fingerprintType: 'carrier',
      matchStrategy: 'contains',
      value: 'Carrier text with extra evidence',
      pageHint: 1,
      required: false,
      weight: 1,
      confidence: 0.99,
      evidenceSnippet: 'Carrier text with extra evidence',
    },
    {
      fingerprintType: 'product',
      matchStrategy: 'contains',
      value: 'FlexLife ICC19-20608(0119) Version 26.0.1 A',
      pageHint: 1,
      required: false,
      weight: 1,
      confidence: 0.98,
      evidenceSnippet: 'FlexLife, Form Number ICC19-20608(0119) Version 26.0.1 A',
    },
  ], {
    carrier: 'Life Insurance Company of the Southwest',
    productName: 'FlexLife',
  });

  expect(result.find(item => item.fingerprintType === 'carrier')?.value).toBe('Life Insurance Company of the Southwest');
  expect(result.find(item => item.fingerprintType === 'carrier')?.matchStrategy).toBe('contains');
  expect(result.find(item => item.fingerprintType === 'product')?.value).toBe('FlexLife');
  expect(result.find(item => item.fingerprintType === 'product')?.matchStrategy).toBe('normalized_contains');
});
