import {
  requiredIllustrationFieldPaths,
  validateIllustrationExtract,
  type IllustrationExtract,
  type IllustrationFieldMappingVerification,
  type IllustrationFieldPath,
  type IllustrationProfileFieldMapping,
  type IllustrationTrainingVerificationReport,
  type IllustrationValidationIssue,
  type JsonObject,
  type JsonValue,
  type PdfExtractionResult,
  type PdfLine,
} from '../types/illustration';
import { extractProfileField } from './illustrationMappingEngine';

export type TrainingPdfReplaySnapshot = {
  fileName?: string;
  fileSha256: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount: number;
  text: string;
  pages: Array<{
    page: number;
    text: string;
    lines: Array<{
      page: number;
      text: string;
    }>;
  }>;
};

function isProfileIdentityFieldPath(path: string) {
  return path === 'carrier' || path === 'productName' || path === 'productType';
}

function requiredRuntimeFieldPaths(productType: IllustrationExtract['productType']) {
  return requiredIllustrationFieldPaths(productType).filter(path => !isProfileIdentityFieldPath(path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractFieldValue(input: unknown, fieldPath: IllustrationFieldPath): string | number | boolean | null | undefined {
  const parts = fieldPath.split('.');
  let current: unknown = input;
  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean' || current == null) return current;
  return undefined;
}

function toJsonValue(value: string | number | boolean | null | undefined): JsonValue | undefined {
  if (value === undefined) return undefined;
  return value;
}

function normalizeComparable(value: string | number | boolean | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
  if (typeof value === 'string') return value.toLowerCase().replace(/\s+/g, ' ').trim();
  return value;
}

function valuesMatch(expected: string | number | boolean | null | undefined, replay: string | number | boolean | null | undefined) {
  const normalizedExpected = normalizeComparable(expected);
  const normalizedReplay = normalizeComparable(replay);
  if (typeof normalizedExpected === 'number' && typeof normalizedReplay === 'number') {
    return Math.abs(normalizedExpected - normalizedReplay) < 0.01;
  }
  return normalizedExpected === normalizedReplay;
}

function verificationIssue(code: IllustrationValidationIssue['code'], path: string, message: string): IllustrationValidationIssue {
  return { code, path, message };
}

function verifyMapping(
  mapping: IllustrationProfileFieldMapping,
  mappingIndex: number,
  pdf: PdfExtractionResult,
  extract: IllustrationExtract,
): IllustrationFieldMappingVerification {
  const expected = extractFieldValue(extract, mapping.fieldPath);
  if (expected == null || expected === '') {
    return {
      fieldPath: mapping.fieldPath,
      required: mapping.required,
      status: mapping.required ? 'missing' : 'skipped',
      expectedValue: toJsonValue(expected),
      mappingIndex,
      message: mapping.required
        ? `${mapping.fieldPath} is required but the reviewed extract has no expected value.`
        : `${mapping.fieldPath} has no reviewed expected value.`,
    };
  }

  const replay = extractProfileField(mapping, pdf);
  if (!replay) {
    return {
      fieldPath: mapping.fieldPath,
      required: mapping.required,
      status: 'missing',
      expectedValue: toJsonValue(expected),
      mappingIndex,
      message: `${mapping.fieldPath} mapping did not produce a replay value.`,
    };
  }

  const passed = valuesMatch(expected, replay.value);
  return {
    fieldPath: mapping.fieldPath,
    required: mapping.required,
    status: passed ? 'passed' : 'failed',
    expectedValue: toJsonValue(expected),
    replayValue: toJsonValue(replay.value),
    evidence: replay.evidence,
    mappingIndex,
    message: passed
      ? undefined
      : `${mapping.fieldPath} replay value did not match the reviewed extract.`,
  };
}

export function verifyIllustrationTrainingMappings(
  pdf: PdfExtractionResult,
  extract: IllustrationExtract,
  fieldMappings: IllustrationProfileFieldMapping[],
): IllustrationTrainingVerificationReport {
  const requiredFields = requiredRuntimeFieldPaths(extract.productType);
  const validation = validateIllustrationExtract(extract);
  const fieldResults = fieldMappings
    .filter(mapping => mapping.sourceStrategy !== 'manual')
    .map((mapping, index) => verifyMapping(mapping, index, pdf, extract));

  const issues: IllustrationValidationIssue[] = validation.ok ? [] : [...validation.issues];
  for (const requiredField of requiredFields) {
    const candidates = fieldResults.filter(result => result.fieldPath === requiredField);
    const passed = candidates.some(result => result.status === 'passed');
    if (passed) continue;
    if (!candidates.length) {
      fieldResults.push({
        fieldPath: requiredField,
        required: true,
        status: 'missing',
        expectedValue: toJsonValue(extractFieldValue(extract, requiredField)),
        message: `${requiredField} is required but no mapping was proposed.`,
      });
      issues.push(verificationIssue('mapping_missing', requiredField, `${requiredField} is required but no mapping was proposed.`));
      continue;
    }
    const failed = candidates.find(result => result.status === 'failed') || candidates[0];
    issues.push(verificationIssue(
      failed.status === 'missing' ? 'mapping_missing' : 'mapping_replay_failed',
      requiredField,
      failed.message || `${requiredField} did not replay successfully.`,
    ));
  }

  const requiredFieldsPassed = requiredFields.every(requiredField =>
    fieldResults.some(result => result.fieldPath === requiredField && result.status === 'passed'),
  );

  return {
    publishable: requiredFieldsPassed && issues.length === 0,
    requiredFieldsPassed,
    requiredFields,
    fieldMappings: fieldResults,
    issues,
    trainingFileName: pdf.fileName,
    trainingFileSha256: pdf.fileSha256,
    verifiedAt: new Date().toISOString(),
  };
}

export function trainingPdfReplaySnapshot(pdf: PdfExtractionResult): TrainingPdfReplaySnapshot {
  return {
    fileName: pdf.fileName,
    fileSha256: pdf.fileSha256,
    mimeType: pdf.mimeType,
    fileSizeBytes: pdf.fileSizeBytes,
    pageCount: pdf.pageCount,
    text: pdf.text,
    pages: pdf.pages.map(page => ({
      page: page.page,
      text: page.text,
      lines: page.lines.map(line => ({
        page: line.page,
        text: line.text,
      })),
    })),
  };
}

export function pdfFromTrainingReplaySnapshot(value: unknown): PdfExtractionResult | null {
  if (!isRecord(value) || !Array.isArray(value.pages)) return null;
  const fileSha256 = typeof value.fileSha256 === 'string' ? value.fileSha256 : '';
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType : 'application/pdf';
  const fileSizeBytes = typeof value.fileSizeBytes === 'number' ? value.fileSizeBytes : 0;
  const pageCount = typeof value.pageCount === 'number' ? value.pageCount : value.pages.length;
  const fileName = typeof value.fileName === 'string' ? value.fileName : undefined;
  const pages = value.pages
    .map(page => {
      if (!isRecord(page) || typeof page.page !== 'number' || typeof page.text !== 'string') return null;
      const lines = Array.isArray(page.lines)
        ? page.lines
            .filter(isRecord)
            .map(line => ({
              page: typeof line.page === 'number' ? line.page : page.page,
              text: typeof line.text === 'string' ? line.text : '',
              items: [],
            } as PdfLine))
            .filter(line => line.text)
        : [];
      return {
        page: page.page,
        text: page.text,
        lines,
        items: [],
      };
    })
    .filter((page): page is PdfExtractionResult['pages'][number] => Boolean(page));
  if (!pages.length) return null;
  return {
    fileName,
    fileSha256,
    mimeType,
    fileSizeBytes,
    pageCount,
    text: typeof value.text === 'string' ? value.text : pages.map(page => page.text).join('\n'),
    pages,
  };
}

export function replaySnapshotJson(pdf: PdfExtractionResult): JsonObject {
  return trainingPdfReplaySnapshot(pdf) as unknown as JsonObject;
}
