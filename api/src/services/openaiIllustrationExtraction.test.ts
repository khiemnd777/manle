import { expect, test } from 'bun:test';
import type { IllustrationExtract, IllustrationProfileFieldMapping, PdfExtractionResult } from '../types/illustration';
import { verifyIllustrationTrainingMappings } from './illustrationTrainingVerification';
import {
  hardenFieldMappingsFromEvidence,
  repairExtractFromEvidence,
} from './openaiIllustrationExtraction';

function extractWithNameEvidence(fullName: string, evidenceText: string): IllustrationExtract {
  return {
    profileId: 'profile',
    profileVersionId: 'version',
    carrier: 'Carrier',
    productName: 'Product',
    productType: 'iul',
    client: {
      fullName,
    },
    policy: {
      faceAmount: 1000000,
      monthlyPremium: 637,
    },
    evidence: {
      'client.fullName:0': {
        page: 4,
        text: evidenceText,
        confidence: 0.98,
        fieldPath: 'client.fullName',
        source: 'pdf_text',
      },
    },
    schemaVersion: 1,
  };
}

function pdfWithPages(pages: Array<{ page: number; text: string }>): PdfExtractionResult {
  return {
    fileName: 'sample.pdf',
    fileSha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    fileSizeBytes: 100,
    pageCount: pages.length,
    text: pages.map(page => page.text).join('\n'),
    pages: pages.map(page => ({
      page: page.page,
      text: page.text,
      lines: page.text.split('\n').map(line => ({
        page: page.page,
        text: line,
        items: [],
      })),
      items: [],
    })),
  };
}

test('repairs blank required client name from OpenAI evidence text', () => {
  const extract = repairExtractFromEvidence(extractWithNameEvidence('', 'Name: Lauren Nguyen'));

  expect(extract.client.fullName).toBe('Lauren Nguyen');
});

test('keeps nonblank OpenAI client name over evidence text', () => {
  const extract = repairExtractFromEvidence(extractWithNameEvidence('Reviewed Name', 'Name: Lauren Nguyen'));

  expect(extract.client.fullName).toBe('Reviewed Name');
});

test('materializes missing scalar extract fields from OpenAI evidence field paths', () => {
  const extract = repairExtractFromEvidence({
    profileId: 'profile',
    profileVersionId: 'version',
    carrier: 'Life Insurance Company of the Southwest',
    productName: 'FlexLife',
    productType: 'iul',
    client: {
      fullName: '',
    },
    policy: {},
    evidence: {
      'client.fullName:0': {
        page: 4,
        text: 'Name: Lauren Nguyen',
        confidence: 0.99,
        fieldPath: 'client.fullName',
        source: 'pdf_text',
      },
      'client.age:1': {
        page: 4,
        text: 'Age: 28',
        confidence: 0.99,
        fieldPath: 'client.age',
        source: 'pdf_text',
      },
      'client.gender:2': {
        page: 4,
        text: 'Female',
        confidence: 0.99,
        fieldPath: 'client.gender',
        source: 'pdf_text',
      },
      'client.state:3': {
        page: 4,
        text: 'State: Texas',
        confidence: 0.99,
        fieldPath: 'client.state',
        source: 'pdf_text',
      },
      'client.riskClass:4': {
        page: 4,
        text: 'Select Non-Tobacco',
        confidence: 0.95,
        fieldPath: 'client.riskClass',
        source: 'pdf_text',
      },
      'policy.faceAmount:5': {
        page: 5,
        text: 'Face Amount: $1,000,000',
        confidence: 0.99,
        fieldPath: 'policy.faceAmount',
        source: 'pdf_text',
      },
      'policy.monthlyPremium:6': {
        page: 4,
        text: 'Initial Premium: $637.00 Monthly',
        confidence: 0.99,
        fieldPath: 'policy.monthlyPremium',
        source: 'pdf_text',
      },
      'policy.premiumMode:7': {
        page: 4,
        text: 'Initial Premium: $637.00 Monthly',
        confidence: 0.99,
        fieldPath: 'policy.premiumMode',
        source: 'pdf_text',
      },
      'policy.payYears:8': {
        page: 1,
        text: '20 Pay',
        confidence: 0.95,
        fieldPath: 'policy.payYears',
        source: 'pdf_text',
      },
    },
    schemaVersion: 1,
  });

  expect(extract.client).toEqual({
    fullName: 'Lauren Nguyen',
    age: 28,
    gender: 'F',
    state: 'Texas',
    riskClass: 'Select Non-Tobacco',
  });
  expect(extract.policy).toEqual({
    faceAmount: 1000000,
    monthlyPremium: 637,
    premiumMode: 'monthly',
    payYears: 20,
  });
});

test('materializes missing projection fields from OpenAI evidence field paths', () => {
  const extract = repairExtractFromEvidence({
    profileId: 'profile',
    profileVersionId: 'version',
    carrier: 'Life Insurance Company of the Southwest',
    productName: 'FlexLife',
    productType: 'iul',
    client: {
      fullName: 'Lauren Nguyen',
    },
    policy: {
      faceAmount: 1000000,
      monthlyPremium: 637,
    },
    evidence: {
      'projections[].year:0': {
        page: 6,
        text: 'Year 42, 47, 52, 57',
        confidence: 0.95,
        fieldPath: 'projections[].year',
        source: 'pdf_text',
      },
      'projections[].age:1': {
        page: 6,
        text: 'Age 69, 74, 79, 84',
        confidence: 0.99,
        fieldPath: 'projections[].age',
        source: 'pdf_text',
      },
      'projections[].policyValue:2': {
        page: 6,
        text: '$949,051 $1,347,072 $1,913,334 $2,707,779',
        confidence: 0.98,
        fieldPath: 'projections[].policyValue',
        source: 'pdf_text',
      },
      'projections[].deathBenefit:3': {
        page: 6,
        text: '$1,100,900 $1,441,367 $2,009,000 $2,843,168',
        confidence: 0.98,
        fieldPath: 'projections[].deathBenefit',
        source: 'pdf_text',
      },
    },
    schemaVersion: 1,
  });

  expect(extract.projections).toEqual([
    { year: 42, age: 69, policyValue: 949051, deathBenefit: 1100900 },
    { year: 47, age: 74, policyValue: 1347072, deathBenefit: 1441367 },
    { year: 52, age: 79, policyValue: 1913334, deathBenefit: 2009000 },
    { year: 57, age: 84, policyValue: 2707779, deathBenefit: 2843168 },
  ]);
});

test('hardens OpenAI label mappings with evidence page hints and regex captures before replay', () => {
  const normalizedExtract: IllustrationExtract = {
    profileId: 'profile',
    profileVersionId: 'version',
    carrier: 'Life Insurance Company of the Southwest',
    productName: 'FlexLife',
    productType: 'iul',
    client: {
      fullName: 'Lauren Nguyen',
    },
    policy: {
      faceAmount: 1000000,
      monthlyPremium: 637,
    },
    evidence: {
      'client.fullName:0': {
        page: 4,
        text: 'Name: Lauren Nguyen',
        confidence: 0.95,
        fieldPath: 'client.fullName',
        source: 'pdf_text',
      },
      'policy.faceAmount:1': {
        page: 4,
        text: 'Death Protection $1,000,000',
        confidence: 0.92,
        fieldPath: 'policy.faceAmount',
        source: 'pdf_text',
      },
      'policy.monthlyPremium:2': {
        page: 4,
        text: 'Initial Premium: $637.00 Monthly',
        confidence: 0.96,
        fieldPath: 'policy.monthlyPremium',
        source: 'pdf_text',
      },
    },
    schemaVersion: 1,
  };
  const looseMappings: IllustrationProfileFieldMapping[] = [
    {
      fieldPath: 'client.fullName',
      sourceStrategy: 'label_value',
      sourceSelector: { label: 'Name:', valuePosition: 'after' },
      transformRules: {},
      required: true,
      minConfidence: 0.8,
    },
    {
      fieldPath: 'policy.faceAmount',
      sourceStrategy: 'label_value',
      sourceSelector: { label: 'Death Protection', valuePosition: 'after' },
      transformRules: {},
      required: true,
      minConfidence: 0.8,
    },
    {
      fieldPath: 'policy.monthlyPremium',
      sourceStrategy: 'label_value',
      sourceSelector: { label: 'Monthly Premium:', valuePosition: 'after' },
      transformRules: {},
      required: true,
      minConfidence: 0.8,
    },
  ];
  const trainingPdf = pdfWithPages([
    {
      page: 1,
      text: 'National Life Group is a trade name representing various affiliates, which offer a variety of financial service products.',
    },
    {
      page: 4,
      text: [
        'Name: Lauren Nguyen',
        'Death Protection',
        '3',
        '$1,000,000',
        'Initial Premium: $637.00 Monthly',
      ].join('\n'),
    },
  ]);

  const hardened = hardenFieldMappingsFromEvidence(trainingPdf, normalizedExtract, looseMappings);
  const report = verifyIllustrationTrainingMappings(trainingPdf, normalizedExtract, hardened);

  expect(report.publishable).toBe(true);
  expect(hardened.find(mapping => mapping.fieldPath === 'policy.faceAmount')?.sourceSelector.regex).toBe('\\$\\s*(?<value>[\\d,]+(?:\\.\\d+)?)');
  expect(hardened.find(mapping => mapping.fieldPath === 'policy.monthlyPremium')?.sourceSelector.label).toBe('Initial Premium');
});
