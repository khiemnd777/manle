import { expect, test } from 'bun:test';
import type {
  IllustrationExtract,
  IllustrationProfileFieldMapping,
  PdfExtractionResult,
} from '../types/illustration';
import { extractProfileField } from './illustrationMappingEngine';
import { verifyIllustrationTrainingMappings } from './illustrationTrainingVerification';

function pdf(text: string): PdfExtractionResult {
  const lines = text.split('\n').map((line, index) => ({
    page: 1,
    text: line,
    y: index,
    items: [],
  }));
  return {
    fileName: 'sample.pdf',
    fileSha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    fileSizeBytes: 100,
    pageCount: 1,
    text,
    pages: [{ page: 1, text, lines, items: [] }],
  };
}

function extract(): IllustrationExtract {
  return {
    profileId: 'profile',
    profileVersionId: 'version',
    carrier: 'Carrier',
    productName: 'Product',
    productType: 'iul',
    client: {
      fullName: 'Cindy Ngoc Phuong',
      gender: 'F',
    },
    policy: {
      faceAmount: 220000,
      monthlyPremium: 300,
    },
    evidence: {},
  };
}

function mapping(
  fieldPath: IllustrationProfileFieldMapping['fieldPath'],
  sourceSelector: IllustrationProfileFieldMapping['sourceSelector'],
  transformRules: IllustrationProfileFieldMapping['transformRules'] = {},
  sourceStrategy: IllustrationProfileFieldMapping['sourceStrategy'] = 'regex',
): IllustrationProfileFieldMapping {
  return {
    fieldPath,
    sourceStrategy,
    sourceSelector,
    transformRules,
    required: true,
    minConfidence: 0.8,
  };
}

test('passes publishable verification when required mappings replay expected values', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For: Cindy Ngoc Phuong',
      'Initial Face Amount: $220,000',
      'Initial Monthly Premium: $300.00',
    ].join('\n')),
    extract(),
    [
      mapping('client.fullName', { regex: 'Designed For:\\s*(?<value>[^\\n]+)' }),
      mapping('policy.faceAmount', { regex: 'Initial Face Amount:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
      mapping('policy.monthlyPremium', { regex: 'Initial Monthly Premium:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
});

test('blocks publishable verification when a required mapping replays the wrong value', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Premium: $182.05',
      'Initial Monthly Premium: $300.00',
      'Designed For: Cindy Ngoc Phuong',
      'Initial Face Amount: $220,000',
    ].join('\n')),
    extract(),
    [
      mapping('client.fullName', { regex: 'Designed For:\\s*(?<value>[^\\n]+)' }),
      mapping('policy.faceAmount', { regex: 'Initial Face Amount:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
      mapping('policy.monthlyPremium', { regex: 'Premium:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
    ],
  );

  expect(report.publishable).toBe(false);
  const monthlyPremium = report.fieldMappings.find(row => row.fieldPath === 'policy.monthlyPremium');
  expect(monthlyPremium?.status).toBe('failed');
  expect(monthlyPremium?.replayValue).toBe(182.05);
});

test('label_value mappings replay values that appear on the line before the label', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For: Cindy Ngoc Phuong',
      '$220,000',
      'Initial Face Amount',
      '$300.00',
      'Initial Monthly Premium including all Riders S&P 500 Index Account 100%',
    ].join('\n')),
    extract(),
    [
      mapping('client.fullName', { label: 'Designed For', pageHint: 1 }, {}, 'label_value'),
      mapping('policy.faceAmount', { label: 'Initial Face Amount:', pageHint: 1 }, { currency: true }, 'label_value'),
      mapping('policy.monthlyPremium', {
        label: 'Initial Monthly Premium',
        lineHint: 'Initial Monthly Premium: $300.00',
        pageHint: 1,
      }, { currency: true }, 'label_value'),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.faceAmount')?.replayValue).toBe(220000);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.monthlyPremium')?.replayValue).toBe(300);
});

test('label_value numeric mappings prefer nearby standalone values when PDF text order is column-interleaved', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For: Cindy Ngoc Phuong',
      '$220,000',
      'Overloan Protection Rider (OPR)',
      'Chronic Illness Accelerated Death Benefit Rider (CRN)',
      'Initial Face Amount',
      'Critical Illness Accelerated Death Benefit Rider (CRT)',
      'Premium',
      'Global Index Account 0%',
      '$300.00',
      'S&P 500 Index Account 100%',
      'Initial Monthly Premium including all Riders S&P 500 Index Account 100%',
    ].join('\n')),
    extract(),
    [
      mapping('client.fullName', {
        label: 'Designed For:',
        lineHint: 'next',
        valuePosition: 'after',
        pageHint: 1,
      }, {}, 'label_value'),
      mapping('policy.faceAmount', {
        label: 'Initial Face Amount',
        lineHint: 'next',
        valuePosition: 'after',
        pageHint: 1,
      }, { currency: true }, 'label_value'),
      mapping('policy.monthlyPremium', {
        label: 'Initial Monthly Premium:',
        lineHint: 'next',
        valuePosition: 'after',
        pageHint: 1,
      }, { currency: true }, 'label_value'),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.faceAmount')?.replayValue).toBe(220000);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.monthlyPremium')?.replayValue).toBe(300);
});

test('label_value mappings use selector regex as a capture rule within label context', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For: Lauren Nguyen',
      'Death Protection',
      '3',
      '$1,000,000',
      'Initial Premium:',
      '3',
      '$637.00 Monthly',
    ].join('\n')),
    {
      ...extract(),
      client: { fullName: 'Lauren Nguyen' },
      policy: {
        faceAmount: 1000000,
        monthlyPremium: 637,
      },
    },
    [
      mapping('client.fullName', { label: 'Designed For:', pageHint: 1 }, {}, 'label_value'),
      mapping('policy.faceAmount', {
        label: 'Death Protection',
        regex: '\\$([\\d,]+)',
        pageHint: 1,
        valuePosition: 'after',
      }, { currency: true }, 'label_value'),
      mapping('policy.monthlyPremium', {
        label: 'Initial Premium:',
        regex: '\\$([\\d.,]+)\\s*Monthly',
        pageHint: 1,
        valuePosition: 'after',
      }, { currency: true }, 'label_value'),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.faceAmount')?.replayValue).toBe(1000000);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.monthlyPremium')?.replayValue).toBe(637);
});

test('single-token colon labels do not match unlabeled words such as trade name', () => {
  const result = extractProfileField(
    mapping('client.fullName', {
      label: 'Name:',
      valuePosition: 'after',
    }, {}, 'label_value'),
    pdf([
      'National Life Group is a trade name representing various affiliates, which offer a variety of financial service products.',
      'Name: Lauren Nguyen',
    ].join('\n')),
  );

  expect(result?.value).toBe('Lauren Nguyen');
  expect(result?.evidence.text).toBe('Name: Lauren Nguyen');
});

test('client age mappings reject currency cents and continue to a valid nearby age', () => {
  const result = extractProfileField(
    mapping('client.age', {
      label: 'Name:',
      regex: '\\b(\\d{2})\\b',
      pageHint: 1,
      valuePosition: 'after',
    }, {}, 'label_value'),
    pdf([
      'Name: Lauren Nguyen',
      'Initial Premium: $637.00 Monthly',
      'Female 28 Select Non-Tobacco',
    ].join('\n')),
  );

  expect(result?.value).toBe(28);
  expect(result?.evidence.text).toBe('Female 28 Select Non-Tobacco');
});

test('label_value mappings tolerate punctuation differences between selector labels and PDF labels', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For Cindy Ngoc Phuong',
      'Initial Face Amount $220,000',
      'Initial Monthly Premium $300.00',
    ].join('\n')),
    extract(),
    [
      mapping('client.fullName', { label: 'Designed For:', pageHint: 1 }, {}, 'label_value'),
      mapping('policy.faceAmount', { label: 'Initial Face Amount:', pageHint: 1 }, { currency: true }, 'label_value'),
      mapping('policy.monthlyPremium', { label: 'Initial Monthly Premium:', pageHint: 1 }, { currency: true }, 'label_value'),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
});

test('illustrated rate mappings replay visible PDF percentages without hardcoded defaults', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For: Cindy Ngoc Phuong',
      'Initial Face Amount: $220,000',
      'Initial Monthly Premium: $300.00',
      'GUARANTEED PROJECTIONS ALTERNATE PROJECTIONS CURRENT PROJECTIONS Interest Rate 0.75% Interest Rate 3.50% Interest Rate 7.80%',
    ].join('\n')),
    {
      ...extract(),
      policy: {
        faceAmount: 220000,
        monthlyPremium: 300,
        illustratedRate: 7.8,
      },
    },
    [
      mapping('client.fullName', { regex: 'Designed For:\\s*(?<value>[^\\n]+)' }),
      mapping('policy.faceAmount', { regex: 'Initial Face Amount:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
      mapping('policy.monthlyPremium', { regex: 'Initial Monthly Premium:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
      mapping('policy.illustratedRate', {
        regex: 'Current Projections[\\s\\S]{0,180}?(?:Interest Rate\\s+\\d+(?:\\.\\d+)?%\\s+){2}Interest Rate\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*%|(?:Illustrated Rates?|Interest Rate):?\\s*(\\d+(?:\\.\\d+)?)\\s*%',
      }, { percent: true }),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
  expect(report.fieldMappings.find(row => row.fieldPath === 'policy.illustratedRate')?.replayValue).toBe(7.8);
});

test('label_value mappings ignore literal selector values instead of hardcoding extracted answers', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf([
      'Designed For: Cindy Ngoc Phuong',
      'Initial Face Amount: $220,000',
      'Initial Monthly Premium: $300.00',
    ].join('\n')),
    extract(),
    [
      mapping('client.fullName', { label: 'Designed For', value: 'Wrong Person', pageHint: 1 }, {}, 'label_value'),
      mapping('policy.faceAmount', { label: 'Initial Face Amount', value: '$999,999', pageHint: 1 }, { currency: true }, 'label_value'),
      mapping('policy.monthlyPremium', { label: 'Initial Monthly Premium', value: '$999.99', pageHint: 1 }, { currency: true }, 'label_value'),
    ],
  );

  expect(report.publishable).toBe(true);
  expect(report.issues).toHaveLength(0);
});

test('pay years mappings reject large dollar amounts such as 7Pay values', () => {
  const result = extractProfileField(
    mapping('policy.payYears', {
      label: '7Pay',
      pageHint: 1,
      valuePosition: 'after',
    }, {}, 'label_value'),
    pdf('5/18/2026 12:55:26 7Pay: $17,018.00'),
  );

  expect(result).toBeNull();
});

test('pay years mappings reject alphanumeric form codes', () => {
  const result = extractProfileField(
    mapping('policy.payYears', {
      label: '7Pay',
      pageHint: 1,
    }, {}, 'label_value'),
    pdf('ICC24 TPIU12IC-0224 Policy Details Issue State: WY\n7Pay'),
  );

  expect(result).toBeNull();
});

test('agent name mappings remove trailing premium fragments', () => {
  const result = extractProfileField(
    mapping('agent.name', {
      label: 'Agent:',
      pageHint: 1,
    }, {}, 'label_value'),
    pdf('Agent: Ms. Regina Dang TP: $4,633.20'),
  );

  expect(result?.value).toBe('Ms. Regina Dang');
});

test('blocks publishable verification when a required mapping is missing', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf('Designed For: Cindy Ngoc Phuong\nInitial Monthly Premium: $300.00'),
    extract(),
    [
      mapping('client.fullName', { regex: 'Designed For:\\s*(?<value>[^\\n]+)' }),
      mapping('policy.monthlyPremium', { regex: 'Initial Monthly Premium:\\s*(?<value>\\$?\\d[\\d,]*(?:\\.\\d+)?)' }, { currency: true }),
    ],
  );

  expect(report.publishable).toBe(false);
  expect(report.fieldMappings.some(row => row.fieldPath === 'policy.faceAmount' && row.status === 'missing')).toBe(true);
});

test('catches broad gender mappings that match a letter inside unrelated text', () => {
  const report = verifyIllustrationTrainingMappings(
    pdf('Supplemental Illustration\nFemale, Age 51'),
    {
      ...extract(),
      policy: {
        faceAmount: 220000,
        monthlyPremium: 300,
      },
    },
    [
      mapping('client.fullName', { value: 'Cindy Ngoc Phuong' }),
      mapping('policy.faceAmount', { value: '220000' }, { currency: true }),
      mapping('policy.monthlyPremium', { value: '300' }, { currency: true }),
      mapping('client.gender', { regex: '(?<value>Female|Male|M|F)' }, { gender: true }),
    ].map(item => item.sourceSelector.value ? { ...item, sourceStrategy: 'constant' } : item),
  );

  const gender = report.fieldMappings.find(row => row.fieldPath === 'client.gender');
  expect(gender?.status).toBe('failed');
  expect(gender?.replayValue).toBe('M');
});
