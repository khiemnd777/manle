import { fail } from '../http/errors';
import {
  ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  extractionRunStatusForRuntimeStatus,
  validateIllustrationExtract,
  type IllustrationEvidenceSnippet,
  type IllustrationExtract,
  type IllustrationFieldPath,
  type IllustrationProfileFieldMapping,
  type IllustrationProfileMatchCandidate,
  type IllustrationProfileProjectionMapping,
  type IllustrationProductType,
  type IllustrationRuntimeErrorCode,
  type IllustrationRuntimeExtractResponse,
  type IllustrationRuntimeExtractStatus,
  type IllustrationValidationIssue,
  type JsonObject,
  type PdfExtractionResult,
  type PdfLine,
} from '../types/illustration';
import type { PublishedIllustrationProfileVersion } from './illustrations';
import {
  getPublishedIllustrationProfileVersion,
  recordIllustrationExtractionRun,
} from './illustrations';
import { matchPublishedIllustrationProfile } from './illustrationMatching';
import { extractPdfTextLayout } from './pdfExtraction';

type RuntimeInput = {
  file: Blob;
  fileName: string;
  maxPages?: number;
  productType?: IllustrationProductType;
  createdBy?: string | null;
};

type FieldExtractionResult = {
  fieldPath: IllustrationFieldPath;
  value: string | number;
  evidence: IllustrationEvidenceSnippet;
  confidence: number;
};

type RawExtractionResult = {
  value: string;
  evidence: IllustrationEvidenceSnippet;
};

const numericFieldPaths = new Set<IllustrationFieldPath>([
  'client.age',
  'policy.faceAmount',
  'policy.monthlyPremium',
  'policy.payYears',
  'policy.termLength',
  'projections[].year',
  'projections[].age',
  'projections[].policyValue',
  'projections[].cashSurrenderValue',
  'projections[].cashValue',
  'projections[].deathBenefit',
]);

const projectionFields = [
  'year',
  'age',
  'policyValue',
  'cashSurrenderValue',
  'cashValue',
  'deathBenefit',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function selectorString(selector: JsonObject | Record<string, unknown>, key: string) {
  const value = selector[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function selectorNumber(selector: JsonObject | Record<string, unknown>, key: string) {
  const value = selector[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampConfidence(value: unknown, fallback = 0.8) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function parsePattern(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      const lastSlash = trimmed.lastIndexOf('/');
      const source = trimmed.slice(1, lastSlash);
      const flags = trimmed.slice(lastSlash + 1).replace(/g/g, '');
      return new RegExp(source, flags.includes('i') ? flags : `${flags}i`);
    }
    return new RegExp(trimmed, 'i');
  } catch {
    return null;
  }
}

function pageLines(pdf: PdfExtractionResult, pageHint?: number | null) {
  if (!pageHint) return pdf.pages.flatMap(page => page.lines);
  return pdf.pages.find(page => page.page === pageHint)?.lines || [];
}

function pageText(pdf: PdfExtractionResult, pageHint?: number | null) {
  if (!pageHint) return pdf.text;
  return pdf.pages.find(page => page.page === pageHint)?.text || '';
}

function snippet(text: string, index = 0, length = text.length) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + Math.max(1, length) + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function pageForOffset(pdf: PdfExtractionResult, index: number) {
  let offset = 0;
  for (const page of pdf.pages) {
    const nextOffset = offset + page.text.length + 1;
    if (index >= offset && index < nextOffset) return page.page;
    offset = nextOffset;
  }
  return 1;
}

function firstCapture(match: RegExpExecArray) {
  if (match.groups?.value) return match.groups.value;
  for (let index = 1; index < match.length; index += 1) {
    if (match[index]) return match[index];
  }
  return match[0];
}

function regexValue(patternText: string, text: string, pdf: PdfExtractionResult, pageHint?: number | null): RawExtractionResult | null {
  const pattern = parsePattern(patternText);
  if (!pattern) return null;
  const match = pattern.exec(text);
  if (!match) return null;
  const value = firstCapture(match).trim();
  if (!value) return null;
  return {
    value,
    evidence: {
      page: pageHint || pageForOffset(pdf, match.index),
      text: snippet(text, match.index, match[0]?.length || value.length),
      confidence: 0.8,
      source: 'pdf_text',
    },
  };
}

function labelValue(selector: JsonObject, pdf: PdfExtractionResult): RawExtractionResult | null {
  const label = selectorString(selector, 'label') || selectorString(selector, 'lineHint');
  if (!label) return null;
  const pageHint = selectorNumber(selector, 'pageHint');
  const lineHint = selectorString(selector, 'lineHint');
  const normalizedLabel = label.toLowerCase();
  const lines = pageLines(pdf, pageHint);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = line.text.toLowerCase();
    if (lineHint && !normalizedLine.includes(lineHint.toLowerCase())) continue;
    const labelIndex = normalizedLine.indexOf(normalizedLabel);
    if (labelIndex < 0) continue;
    const afterLabel = line.text.slice(labelIndex + label.length).replace(/^[\s:;\-]+/, '').trim();
    const value = afterLabel || lines[index + 1]?.text.trim() || '';
    if (!value) continue;
    return {
      value,
      evidence: {
        page: line.page,
        text: line.text,
        confidence: 0.82,
        source: 'pdf_text',
      },
    };
  }

  return null;
}

function rowPatternValue(selector: JsonObject, pdf: PdfExtractionResult): RawExtractionResult | null {
  const pageHint = selectorNumber(selector, 'pageHint');
  const pattern = selectorString(selector, 'regex') || selectorString(selector, 'rowPattern');
  if (pattern) {
    const text = pageText(pdf, pageHint);
    return regexValue(pattern, text, pdf, pageHint);
  }

  const lineHint = selectorString(selector, 'lineHint') || selectorString(selector, 'rowPattern');
  if (!lineHint) return null;
  const normalizedHint = lineHint.toLowerCase();
  const line = pageLines(pdf, pageHint).find(item => item.text.toLowerCase().includes(normalizedHint));
  if (!line) return null;
  return {
    value: line.text,
    evidence: {
      page: line.page,
      text: line.text,
      confidence: 0.78,
      source: 'pdf_text',
    },
  };
}

function rawValueForMapping(mapping: IllustrationProfileFieldMapping, pdf: PdfExtractionResult): RawExtractionResult | null {
  const selector = mapping.sourceSelector || {};
  const pageHint = selectorNumber(selector, 'pageHint');
  const regex = selectorString(selector, 'regex');
  if (mapping.sourceStrategy === 'constant') {
    const value = selectorString(selector, 'value');
    return value ? {
      value,
      evidence: {
        page: 1,
        text: value,
        confidence: 1,
        source: 'manual',
      },
    } : null;
  }
  if (mapping.sourceStrategy === 'filename') {
    const fileName = pdf.fileName || '';
    if (!regex) {
      return fileName ? {
        value: fileName,
        evidence: {
          page: 1,
          text: fileName,
          confidence: 0.72,
          source: 'filename',
        },
      } : null;
    }
    const match = regexValue(regex, fileName, pdf, 1);
    return match ? { ...match, evidence: { ...match.evidence, page: 1, source: 'filename' } } : null;
  }
  if (mapping.sourceStrategy === 'regex') {
    return regex ? regexValue(regex, pageText(pdf, pageHint), pdf, pageHint) : null;
  }
  if (mapping.sourceStrategy === 'table_cell') {
    return rowPatternValue(selector, pdf);
  }
  if (mapping.sourceStrategy === 'label_value') {
    return labelValue(selector, pdf) || (regex ? regexValue(regex, pageText(pdf, pageHint), pdf, pageHint) : null);
  }
  return null;
}

function parseNumber(value: string) {
  const normalized = value.replace(/\(([^)]+)\)/g, '-$1');
  const match = normalized.match(/-?\$?\s*\d[\d,]*(?:\.\d+)?/);
  if (!match) return undefined;
  const numeric = Number(match[0].replace(/[$,\s]/g, ''));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseGender(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'f' || normalized.includes('female')) return 'F';
  if (normalized === 'm' || normalized.includes('male')) return 'M';
  return undefined;
}

function parsePremiumMode(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('monthly') || normalized.includes('month')) return 'monthly';
  if (normalized.includes('quarterly') || normalized.includes('quarter')) return 'quarterly';
  if (normalized.includes('annual') || normalized.includes('yearly') || normalized.includes('year')) return 'annual';
  return undefined;
}

function normalizeFieldValue(path: IllustrationFieldPath, rawValue: string, transforms: JsonObject): string | number | undefined {
  const value = rawValue.trim();
  if (!value) return undefined;
  if (path === 'client.gender' || transforms.gender === true) return parseGender(value);
  if (path === 'policy.premiumMode') return parsePremiumMode(value);
  if (path === 'productType') {
    const normalized = value.toLowerCase();
    if (normalized.includes('term')) return 'term';
    if (normalized.includes('iul') || normalized.includes('index')) return 'iul';
    return undefined;
  }
  if (numericFieldPaths.has(path) || transforms.currency === true || transforms.percent === true) {
    return parseNumber(value);
  }
  if (transforms.phone === true) return value.replace(/\s+/g, ' ');
  return value.replace(/\s+/g, ' ');
}

function extractField(mapping: IllustrationProfileFieldMapping, pdf: PdfExtractionResult): FieldExtractionResult | null {
  const raw = rawValueForMapping(mapping, pdf);
  if (!raw) return null;
  const value = normalizeFieldValue(mapping.fieldPath, raw.value, mapping.transformRules || {});
  if (value == null || value === '') return null;
  const confidence = clampConfidence(mapping.minConfidence, raw.evidence.confidence);
  return {
    fieldPath: mapping.fieldPath,
    value,
    evidence: {
      ...raw.evidence,
      fieldPath: mapping.fieldPath,
      confidence,
      text: raw.evidence.text.slice(0, 500),
    },
    confidence,
  };
}

function assignExtractValue(extract: IllustrationExtract, result: FieldExtractionResult) {
  const value = result.value;
  switch (result.fieldPath) {
    case 'carrier':
      if (typeof value === 'string') extract.carrier = value;
      break;
    case 'productName':
      if (typeof value === 'string') extract.productName = value;
      break;
    case 'productType':
      if (value === 'iul' || value === 'term') extract.productType = value;
      break;
    case 'client.fullName':
      if (typeof value === 'string') extract.client.fullName = value;
      break;
    case 'client.age':
      if (typeof value === 'number') extract.client.age = value;
      break;
    case 'client.gender':
      if (value === 'M' || value === 'F') extract.client.gender = value;
      break;
    case 'client.state':
      if (typeof value === 'string') extract.client.state = value;
      break;
    case 'client.riskClass':
      if (typeof value === 'string') extract.client.riskClass = value;
      break;
    case 'policy.faceAmount':
      if (typeof value === 'number') extract.policy.faceAmount = value;
      break;
    case 'policy.monthlyPremium':
      if (typeof value === 'number') extract.policy.monthlyPremium = value;
      break;
    case 'policy.premiumMode':
      if (value === 'monthly' || value === 'annual' || value === 'quarterly') extract.policy.premiumMode = value;
      break;
    case 'policy.payYears':
      if (typeof value === 'number') extract.policy.payYears = value;
      break;
    case 'policy.termLength':
      if (typeof value === 'number') extract.policy.termLength = value;
      break;
    case 'agent.name':
      extract.agent = { ...(extract.agent || {}), name: String(value) };
      break;
    case 'agent.phone':
      extract.agent = { ...(extract.agent || {}), phone: String(value) };
      break;
    default:
      break;
  }
}

function issue(code: IllustrationValidationIssue['code'], path: string, message: string): IllustrationValidationIssue {
  return { code, path, message };
}

function namedOrMappedValue(
  field: typeof projectionFields[number],
  line: PdfLine,
  mapping: IllustrationProfileProjectionMapping,
  rowMatch?: RegExpExecArray,
) {
  const grouped = rowMatch?.groups?.[field];
  if (grouped) return parseNumber(grouped);
  const selectors = [mapping.valueMappings, mapping.columnMappings].filter(isRecord);
  for (const selector of selectors) {
    const fieldSelector = selector[field];
    if (typeof fieldSelector === 'string') {
      const raw = regexValue(fieldSelector, line.text, {
        fileSha256: '',
        fileName: '',
        mimeType: 'application/pdf',
        fileSizeBytes: 0,
        pageCount: 1,
        text: line.text,
        pages: [{ page: line.page, text: line.text, lines: [line], items: line.items }],
      }, line.page);
      if (raw) return parseNumber(raw.value);
    }
    if (typeof fieldSelector === 'number' && Number.isFinite(fieldSelector)) return fieldSelector;
  }
  return undefined;
}

function extractProjections(mappings: IllustrationProfileProjectionMapping[], pdf: PdfExtractionResult) {
  const projections: NonNullable<IllustrationExtract['projections']> = [];
  for (const mapping of mappings) {
    if (mapping.sourceStrategy === 'manual') continue;
    const rowSelector = mapping.rowSelector || {};
    const pageHint = selectorNumber(rowSelector, 'pageHint');
    const patternText = selectorString(rowSelector, 'regex') || selectorString(rowSelector, 'rowPattern');
    const pattern = patternText ? parsePattern(patternText) : null;
    const lines = pageLines(pdf, pageHint).filter(line => {
      if (pattern) return pattern.test(line.text);
      const lineHint = selectorString(rowSelector, 'lineHint') || selectorString(rowSelector, 'tableHeader');
      return lineHint ? line.text.toLowerCase().includes(lineHint.toLowerCase()) : false;
    });

    for (const line of lines) {
      const rowMatch = pattern ? parsePattern(patternText)?.exec(line.text) || undefined : undefined;
      const projection: Record<string, number> = {};
      for (const field of projectionFields) {
        const value = namedOrMappedValue(field, line, mapping, rowMatch);
        if (value != null) projection[field] = value;
      }
      if (typeof projection.age === 'number') projections.push(projection as NonNullable<IllustrationExtract['projections']>[number]);
    }
  }
  return projections;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildExtract(
  published: PublishedIllustrationProfileVersion,
  pdf: PdfExtractionResult,
  match: IllustrationProfileMatchCandidate,
) {
  const extract: IllustrationExtract = {
    profileId: published.profile.id,
    profileVersionId: published.version.id,
    profileVersionNumber: published.version.versionNumber,
    carrier: published.profile.carrier,
    productName: published.profile.productName,
    productType: published.profile.productType,
    client: { fullName: '' },
    policy: {},
    evidence: { ...match.evidence },
    fieldConfidence: {},
    matchScore: match.score,
    schemaVersion: ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  };
  const issues: IllustrationValidationIssue[] = [];
  const confidences: number[] = [];

  for (const mapping of published.fieldMappings) {
    const result = extractField(mapping, pdf);
    if (!result) {
      if (mapping.required) {
        issues.push(issue('missing_required_field', mapping.fieldPath, `Required mapping ${mapping.fieldPath} did not produce a value.`));
      }
      continue;
    }
    assignExtractValue(extract, result);
    extract.evidence[mapping.fieldPath] = result.evidence;
    extract.fieldConfidence![mapping.fieldPath] = result.confidence;
    confidences.push(result.confidence);
  }

  const projections = extractProjections(published.projectionMappings, pdf);
  if (projections.length) extract.projections = projections;

  const extractionConfidence = Math.min(match.score, average(confidences));
  extract.extractionConfidence = extractionConfidence;
  return { extract, issues, extractionConfidence };
}

async function recordBlocked(
  pdf: PdfExtractionResult,
  input: RuntimeInput,
  status: IllustrationRuntimeExtractStatus,
  code: IllustrationRuntimeErrorCode,
  message: string,
  match?: Partial<IllustrationProfileMatchCandidate>,
  issues?: IllustrationValidationIssue[],
): Promise<IllustrationRuntimeExtractResponse> {
  const run = await recordIllustrationExtractionRun({
    profileId: match?.profileId || null,
    profileVersionId: match?.profileVersionId || null,
    runType: 'runtime_extract',
    status: extractionRunStatusForRuntimeStatus(status),
    inputSha256: pdf.fileSha256,
    matchScore: match?.score ?? null,
    evidenceSnippets: match?.evidence || {},
    errorCode: code,
    errorMessage: message,
    metadata: {
      fileName: input.fileName,
      pageCount: pdf.pageCount,
      extractedPageCount: pdf.pages.length,
      issueCount: issues?.length || 0,
    },
    createdBy: input.createdBy || null,
  });
  return {
    status,
    code,
    message,
    runId: run.id,
    match,
    issues,
  };
}

export async function extractRuntimeIllustration(input: RuntimeInput): Promise<IllustrationRuntimeExtractResponse> {
  const pdf = await extractPdfTextLayout(input.file, {
    fileName: input.fileName,
    mimeType: input.file.type || 'application/pdf',
    maxPages: input.maxPages,
  });
  const matchResult = await matchPublishedIllustrationProfile(pdf, { productType: input.productType });
  if (matchResult.status !== 'matched') {
    const runtimeStatus = matchResult.status === 'no_published_profile' ? 'no_published_profile' : 'unsupported_profile';
    return await recordBlocked(
      pdf,
      input,
      runtimeStatus,
      matchResult.code,
      matchResult.message,
      matchResult.bestCandidate,
    );
  }

  const published = await getPublishedIllustrationProfileVersion(matchResult.match.profileId);
  if (!published) {
    return await recordBlocked(
      pdf,
      input,
      'no_published_profile',
      'no_published_profile',
      'The matched profile is no longer published.',
      matchResult.match,
    );
  }

  const { extract, issues, extractionConfidence } = buildExtract(published, pdf, matchResult.match);
  const validation = validateIllustrationExtract(extract);
  const allIssues = [...issues, ...(validation.ok ? [] : validation.issues)];
  const confidenceIssue = extractionConfidence < published.version.minExtractionConfidence
    ? issue('invalid_confidence', 'extractionConfidence', 'Extraction confidence is below the published profile threshold.')
    : null;
  if (confidenceIssue) allIssues.push(confidenceIssue);

  if (allIssues.length) {
    const message = confidenceIssue
      ? 'The published profile matched, but extraction confidence is below the approved threshold.'
      : 'The published profile matched, but approved mappings did not produce a valid extract.';
    const run = await recordIllustrationExtractionRun({
      profileId: published.profile.id,
      profileVersionId: published.version.id,
      runType: 'runtime_extract',
      status: 'needs_review',
      inputSha256: pdf.fileSha256,
      matchScore: matchResult.match.score,
      extractionConfidence,
      normalizedExtract: extract,
      evidenceSnippets: extract.evidence,
      errorCode: confidenceIssue ? 'low_extraction_confidence' : 'validation_failed',
      errorMessage: message,
      metadata: {
        fileName: input.fileName,
        pageCount: pdf.pageCount,
        extractedPageCount: pdf.pages.length,
        mappedFieldCount: Object.keys(extract.fieldConfidence || {}).length,
        projectionCount: extract.projections?.length || 0,
        issueCount: allIssues.length,
      },
      createdBy: input.createdBy || null,
    });
    return {
      status: 'needs_review',
      code: confidenceIssue ? 'low_extraction_confidence' : 'validation_failed',
      message,
      runId: run.id,
      match: matchResult.match,
      issues: allIssues,
    };
  }

  const run = await recordIllustrationExtractionRun({
    profileId: published.profile.id,
    profileVersionId: published.version.id,
    runType: 'runtime_extract',
    status: 'succeeded',
    inputSha256: pdf.fileSha256,
    matchScore: matchResult.match.score,
    extractionConfidence,
    normalizedExtract: extract,
    evidenceSnippets: extract.evidence,
    metadata: {
      fileName: input.fileName,
      pageCount: pdf.pageCount,
      extractedPageCount: pdf.pages.length,
      mappedFieldCount: Object.keys(extract.fieldConfidence || {}).length,
      projectionCount: extract.projections?.length || 0,
    },
    createdBy: input.createdBy || null,
  });

  return {
    status: 'succeeded',
    extract,
    match: matchResult.match,
    assets: {
      carrierLogoUrl: published.profile.carrierLogoUrl ?? null,
    },
    runId: run.id,
  };
}

export function invalidRuntimeIllustrationUpload(code: IllustrationRuntimeErrorCode, message: string): IllustrationRuntimeExtractResponse {
  return {
    status: 'extraction_failed',
    code,
    message,
  };
}

export function requireRuntimePdfFile(upload: FormDataEntryValue | null): Blob {
  if (!(upload instanceof Blob)) fail(400, 'invalid_pdf', 'A PDF file is required.');
  return upload;
}
