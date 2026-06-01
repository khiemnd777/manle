import { config } from '../config';
import { fail } from '../http/errors';
import {
  ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  isConfidence,
  isIllustrationGender,
  isIllustrationPremiumMode,
  isIllustrationProductType,
  requiredIllustrationFieldPaths,
  validateIllustrationExtract,
  type IllustrationAdminTrainResponse,
  type IllustrationEvidenceSnippet,
  type IllustrationExtract,
  type IllustrationFieldPath,
  type IllustrationProfileFieldMapping,
  type IllustrationProfileFingerprint,
  type IllustrationProfileProjectionMapping,
  type IllustrationProjectionExtract,
  type IllustrationProductType,
  type IllustrationRuntimeErrorCode,
  type IllustrationTrainingProposal,
  type JsonObject,
  type PdfExtractionResult,
} from '../types/illustration';
import {
  extractProfileField,
  normalizeFieldValue,
  parseMappingNumber,
} from './illustrationMappingEngine';
import {
  sanitizeRuntimeFieldMapping,
  sanitizeRuntimeProjectionMapping,
} from './illustrationMappingSanitizer';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_PROMPT_CHARS = 36_000;
const MAX_PAGE_CHARS = 3_500;

type NullableNumber = number | null;
type NullableString = string | null;
type NullableBoolean = boolean | null;

type GeneratedSelector = {
  label: NullableString;
  regex: NullableString;
  pageHint: NullableNumber;
  lineHint: NullableString;
  tableHeader: NullableString;
  columnName: NullableString;
  rowPattern: NullableString;
  value: NullableString;
  valuePosition: NullableString;
};

type GeneratedTransform = {
  currency: NullableBoolean;
  percent: NullableBoolean;
  date: NullableBoolean;
  state: NullableBoolean;
  gender: NullableBoolean;
  phone: NullableBoolean;
  notes: NullableString;
};

type GeneratedEvidence = {
  fieldPath: IllustrationFieldPath;
  page: number;
  text: string;
  confidence: number;
};

type GeneratedProjection = {
  year: NullableNumber;
  age: number;
  policyValue: NullableNumber;
  cashSurrenderValue: NullableNumber;
  cashValue: NullableNumber;
  deathBenefit: NullableNumber;
};

type GeneratedTrainingOutput = {
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  client: {
    fullName: string;
    age: NullableNumber;
    gender: 'M' | 'F' | null;
    state: NullableString;
    riskClass: NullableString;
  };
  policy: {
    faceAmount: NullableNumber;
    monthlyPremium: NullableNumber;
    premiumMode: 'monthly' | 'annual' | 'quarterly' | null;
    illustratedRate: NullableNumber;
    payYears: NullableNumber;
    termLength: NullableNumber;
  };
  projections: GeneratedProjection[];
  agent: {
    name: NullableString;
    phone: NullableString;
  };
  evidence: GeneratedEvidence[];
  fieldConfidence: Array<{
    fieldPath: IllustrationFieldPath;
    confidence: number;
  }>;
  fingerprints: Array<{
    fingerprintType: IllustrationProfileFingerprint['fingerprintType'];
    matchStrategy: IllustrationProfileFingerprint['matchStrategy'];
    value: string;
    pageHint: NullableNumber;
    required: boolean;
    weight: number;
    confidence: number;
    evidenceSnippet: string;
  }>;
  fieldMappings: Array<{
    fieldPath: IllustrationFieldPath;
    sourceStrategy: IllustrationProfileFieldMapping['sourceStrategy'];
    sourceSelector: GeneratedSelector;
    transformRules: GeneratedTransform;
    required: boolean;
    minConfidence: number;
    notes: string;
  }>;
  projectionMappings: Array<{
    projectionKey: string;
    sourceStrategy: IllustrationProfileProjectionMapping['sourceStrategy'];
    rowSelector: GeneratedSelector;
    columnMappings: GeneratedSelector;
    valueMappings: GeneratedSelector;
    transformRules: GeneratedTransform;
    required: boolean;
    minConfidence: number;
    notes: string;
  }>;
  confidence: number;
};

export type OpenAIIllustrationTrainingInput = {
  profileId: string;
  profileVersionId?: string;
  exampleId?: string;
  carrier?: string;
  productName?: string;
  productType?: IllustrationProductType;
  pdf: PdfExtractionResult;
  useFastModel?: boolean;
  expectedExtract?: Partial<IllustrationTrainingProposal['normalizedExtract']>;
  verificationIssues?: Array<{ path: string; message: string }>;
};

type ProposalAttemptResult =
  | {
      ok: true;
      modelName: string;
      proposal: IllustrationTrainingProposal;
      validationOk: boolean;
    }
  | {
      ok: false;
      modelName: string;
      code: IllustrationRuntimeErrorCode;
      message: string;
      proposal?: IllustrationTrainingProposal;
    };

const nullableString = () => ({ anyOf: [{ type: 'string' }, { type: 'null' }] });
const nullableNumber = () => ({ anyOf: [{ type: 'number' }, { type: 'null' }] });
const nullableBoolean = () => ({ anyOf: [{ type: 'boolean' }, { type: 'null' }] });

const fieldPathEnum: IllustrationFieldPath[] = [
  'carrier',
  'productName',
  'productType',
  'client.fullName',
  'client.age',
  'client.gender',
  'client.state',
  'client.riskClass',
  'policy.faceAmount',
  'policy.monthlyPremium',
  'policy.premiumMode',
  'policy.illustratedRate',
  'policy.payYears',
  'policy.termLength',
  'agent.name',
  'agent.phone',
  'projections[].year',
  'projections[].age',
  'projections[].policyValue',
  'projections[].cashSurrenderValue',
  'projections[].cashValue',
  'projections[].deathBenefit',
];

const selectorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'regex', 'pageHint', 'lineHint', 'tableHeader', 'columnName', 'rowPattern', 'value', 'valuePosition'],
  properties: {
    label: nullableString(),
    regex: { type: 'string', minLength: 1 },
    pageHint: nullableNumber(),
    lineHint: nullableString(),
    tableHeader: nullableString(),
    columnName: nullableString(),
    rowPattern: nullableString(),
    value: nullableString(),
    valuePosition: nullableString(),
  },
};

const transformSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['currency', 'percent', 'date', 'state', 'gender', 'phone', 'notes'],
  properties: {
    currency: nullableBoolean(),
    percent: nullableBoolean(),
    date: nullableBoolean(),
    state: nullableBoolean(),
    gender: nullableBoolean(),
    phone: nullableBoolean(),
    notes: nullableString(),
  },
};

const trainingOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'carrier',
    'productName',
    'productType',
    'client',
    'policy',
    'projections',
    'agent',
    'evidence',
    'fieldConfidence',
    'fingerprints',
    'fieldMappings',
    'projectionMappings',
    'confidence',
  ],
  properties: {
    carrier: { type: 'string' },
    productName: { type: 'string' },
    productType: { type: 'string', enum: ['iul', 'term'] },
    client: {
      type: 'object',
      additionalProperties: false,
      required: ['fullName', 'age', 'gender', 'state', 'riskClass'],
      properties: {
        fullName: { type: 'string' },
        age: nullableNumber(),
        gender: { anyOf: [{ type: 'string', enum: ['M', 'F'] }, { type: 'null' }] },
        state: nullableString(),
        riskClass: nullableString(),
      },
    },
    policy: {
      type: 'object',
      additionalProperties: false,
      required: ['faceAmount', 'monthlyPremium', 'premiumMode', 'illustratedRate', 'payYears', 'termLength'],
      properties: {
        faceAmount: nullableNumber(),
        monthlyPremium: nullableNumber(),
        premiumMode: { anyOf: [{ type: 'string', enum: ['monthly', 'annual', 'quarterly'] }, { type: 'null' }] },
        illustratedRate: nullableNumber(),
        payYears: nullableNumber(),
        termLength: nullableNumber(),
      },
    },
    projections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['year', 'age', 'policyValue', 'cashSurrenderValue', 'cashValue', 'deathBenefit'],
        properties: {
          year: nullableNumber(),
          age: { type: 'number' },
          policyValue: nullableNumber(),
          cashSurrenderValue: nullableNumber(),
          cashValue: nullableNumber(),
          deathBenefit: nullableNumber(),
        },
      },
    },
    agent: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'phone'],
      properties: {
        name: nullableString(),
        phone: nullableString(),
      },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldPath', 'page', 'text', 'confidence'],
        properties: {
          fieldPath: { type: 'string', enum: fieldPathEnum },
          page: { type: 'integer' },
          text: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    fieldConfidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldPath', 'confidence'],
        properties: {
          fieldPath: { type: 'string', enum: fieldPathEnum },
          confidence: { type: 'number' },
        },
      },
    },
    fingerprints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fingerprintType', 'matchStrategy', 'value', 'pageHint', 'required', 'weight', 'confidence', 'evidenceSnippet'],
        properties: {
          fingerprintType: { type: 'string', enum: ['carrier', 'product', 'form', 'version', 'text', 'regex', 'layout'] },
          matchStrategy: { type: 'string', enum: ['contains', 'equals', 'regex', 'normalized_contains'] },
          value: { type: 'string' },
          pageHint: nullableNumber(),
          required: { type: 'boolean' },
          weight: { type: 'number' },
          confidence: { type: 'number' },
          evidenceSnippet: { type: 'string' },
        },
      },
    },
    fieldMappings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldPath', 'sourceStrategy', 'sourceSelector', 'transformRules', 'required', 'minConfidence', 'notes'],
        properties: {
          fieldPath: { type: 'string', enum: fieldPathEnum },
          sourceStrategy: { type: 'string', enum: ['label_value', 'regex', 'table_cell', 'filename', 'constant', 'manual'] },
          sourceSelector: selectorSchema,
          transformRules: transformSchema,
          required: { type: 'boolean' },
          minConfidence: { type: 'number' },
          notes: { type: 'string' },
        },
      },
    },
    projectionMappings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['projectionKey', 'sourceStrategy', 'rowSelector', 'columnMappings', 'valueMappings', 'transformRules', 'required', 'minConfidence', 'notes'],
        properties: {
          projectionKey: { type: 'string' },
          sourceStrategy: { type: 'string', enum: ['table', 'summary_block', 'regex', 'manual'] },
          rowSelector: selectorSchema,
          columnMappings: selectorSchema,
          valueMappings: selectorSchema,
          transformRules: transformSchema,
          required: { type: 'boolean' },
          minConfidence: { type: 'number' },
          notes: { type: 'string' },
        },
      },
    },
    confidence: { type: 'number' },
  },
};

function requireOpenAIConfig() {
  if (!config.openaiApiKey) {
    fail(503, 'openai_not_configured', 'OpenAI extraction is not configured for admin training.');
  }
}

function modelSequence(useFastModel?: boolean) {
  const primary = useFastModel ? config.openaiExtractorFastModel : config.openaiExtractorModel;
  const models = [primary].filter(Boolean);
  if (config.openaiExtractorAllowRetry && config.openaiExtractorRetryModel && !models.includes(config.openaiExtractorRetryModel)) {
    models.push(config.openaiExtractorRetryModel);
  }
  return models;
}

function limitedPdfPrompt(pdf: PdfExtractionResult) {
  let remaining = MAX_PROMPT_CHARS;
  const sections: string[] = [];
  for (const page of pdf.pages) {
    if (remaining <= 0) break;
    const pageText = page.text.replace(/\s+/g, ' ').trim().slice(0, Math.min(MAX_PAGE_CHARS, remaining));
    sections.push(`Page ${page.page}:\n${pageText}`);
    remaining -= pageText.length;
  }
  return sections.join('\n\n');
}

function trainingPrompt(input: OpenAIIllustrationTrainingInput) {
  const profileIdentity = [
    input.carrier ? `Carrier: ${input.carrier}` : null,
    input.productName ? `Product: ${input.productName}` : null,
    input.productType ? `Product type: ${input.productType}` : null,
  ].filter(Boolean).join('\n');
  const expectedExtract = input.expectedExtract
    ? `Reviewed expected extract:\n${JSON.stringify(input.expectedExtract).slice(0, 12000)}`
    : '';
  const verificationIssues = input.verificationIssues?.length
    ? `Previous replay issues:\n${input.verificationIssues.map(issue => `- ${issue.path}: ${issue.message}`).join('\n')}`
    : '';

  return [
    'You extract life-insurance illustration fields for MANLE admin training.',
    'Use only values visible in the provided PDF text. Do not infer missing insurance values.',
    'Return conservative mapping proposals that an admin can review before publishing.',
    'Every evidence text must be a short snippet from the PDF text, not the full document.',
    'Fingerprints must distinguish carrier plus product/form/version; do not rely on carrier alone.',
    'Prefer label_value or table_cell mappings when labels/tables are visible; use regex only for stable repeated patterns.',
    'Field mappings are runtime selectors, not just extracted answers. Return mappings that can replay the normalized extract on the same PDF.',
    'Every sourceSelector, rowSelector, columnMappings, and valueMappings regex must be a non-empty reusable regex. Do not return null or empty regex.',
    'Every field mapping regex must capture the extracted value with a named group (?<value>...) or a first capture group. Do not rely on label-only extraction.',
    'For money, premium, face amount, cash value, surrender value, death benefit, pay years, term length, age, and projection numbers, regex must capture only the numeric/value token, not unrelated nearby numbers.',
    'For IUL illustrated/current interest rates, use policy.illustratedRate with transformRules.percent=true and capture the visible percent value from the PDF. Do not assume or hard-code a default rate.',
    'Always include runtime field mappings for client.fullName, policy.faceAmount, and the required product premium field: policy.monthlyPremium for IUL or policy.termLength for Term.',
    'For label/value pairs, use the exact reusable label text visible in the PDF. If the value is before the label, set sourceSelector.valuePosition to "before"; if the value is after the label or on the next line, set it to "after".',
    'Do not put extracted answers, applicant names, dollar amounts, ages, dates, or phone numbers in sourceSelector.value for client, policy, or agent field mappings. Use value only for constant/manual mappings.',
    'A field mapping selector must be reusable for a different customer PDF from the same carrier/product, so selectors must identify stable labels, nearby context, regex captures, table headers, or row patterns rather than the extracted answer itself.',
    'For gender, do not use a bare M/F regex unless it is bounded by nearby sex/gender/age context.',
    expectedExtract ? 'When a reviewed expected extract is provided, keep those values as expected answers and focus on selectors that replay those values from the PDF.' : '',
    verificationIssues ? 'Fix the previous replay issues by proposing selectors that return the reviewed expected values, not merely nearby values.' : '',
    profileIdentity ? `Target profile identity:\n${profileIdentity}` : 'Target profile identity: unknown; infer conservatively from the PDF text.',
    `PDF metadata: file=${input.pdf.fileName || 'unknown'}, sha256=${input.pdf.fileSha256}, pages=${input.pdf.pageCount}`,
    expectedExtract,
    verificationIssues,
    `PDF text excerpt:\n${limitedPdfPrompt(input.pdf)}`,
  ].filter(Boolean).join('\n\n');
}

async function openAIRequest(model: string, input: OpenAIIllustrationTrainingInput) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'You return only schema-valid JSON for MANLE illustration profile training.',
        },
        {
          role: 'user',
          content: trainingPrompt(input),
        },
      ],
      max_output_tokens: 12000,
      text: {
        format: {
          type: 'json_schema',
          name: 'manle_illustration_training_proposal',
          strict: true,
          schema: trainingOutputSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${body.slice(0, 500)}`);
  }
  return await response.json();
}

function responseText(response: any) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const parts: string[] = [];
  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
      if (content.type === 'refusal' && typeof content.refusal === 'string') {
        throw new Error(`OpenAI refused the extraction request: ${content.refusal}`);
      }
    }
  }
  const text = parts.join('\n').trim();
  if (!text) throw new Error('OpenAI response did not include output text.');
  return text;
}

function jsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function cleanSelector(selector: GeneratedSelector): JsonObject {
  return jsonObject(Object.fromEntries(Object.entries(selector).filter(([, value]) => value != null && value !== '')));
}

function cleanTransform(transform: GeneratedTransform): JsonObject {
  return jsonObject(Object.fromEntries(Object.entries(transform).filter(([, value]) => value != null && value !== '')));
}

function optionalNumber(value: NullableNumber | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: NullableString | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanConfidence(value: number, fallback = 0.5) {
  return isConfidence(value) ? value : fallback;
}

function stableRequiredFingerprintType(type: IllustrationProfileFingerprint['fingerprintType']) {
  return type === 'carrier' || type === 'product';
}

function isProfileIdentityFieldPath(path: string) {
  return path === 'carrier' || path === 'productName' || path === 'productType';
}

function requiredRuntimeFieldPath(productType: IllustrationProductType, fieldPath: IllustrationFieldPath) {
  return !isProfileIdentityFieldPath(fieldPath)
    && requiredIllustrationFieldPaths(productType).includes(fieldPath);
}

function evidenceRecord(items: GeneratedEvidence[]) {
  const record: Record<string, IllustrationEvidenceSnippet> = {};
  items.forEach((item, index) => {
    record[`${item.fieldPath}:${index}`] = {
      page: Math.max(1, Math.round(item.page || 1)),
      text: item.text.trim().slice(0, 500),
      confidence: cleanConfidence(item.confidence),
      fieldPath: item.fieldPath,
      source: 'pdf_text',
    };
  });
  return record;
}

function fieldConfidence(items: GeneratedTrainingOutput['fieldConfidence']) {
  const values: Partial<Record<IllustrationFieldPath, number>> = {};
  for (const item of items) {
    values[item.fieldPath] = cleanConfidence(item.confidence);
  }
  return values;
}

function evidenceTextForField(
  evidence: Record<string, IllustrationEvidenceSnippet>,
  fieldPath: IllustrationFieldPath,
) {
  return Object.values(evidence)
    .find(item => item.fieldPath === fieldPath && item.text.trim())
    ?.text.trim();
}

function stripLeadingEvidenceLabel(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[A-Za-z][A-Za-z\s./'()-]{0,80}:\s*/, '')
    .trim();
}

const scalarEvidenceFieldPaths: IllustrationFieldPath[] = [
  'carrier',
  'productName',
  'productType',
  'client.fullName',
  'client.age',
  'client.gender',
  'client.state',
  'client.riskClass',
  'policy.faceAmount',
  'policy.monthlyPremium',
  'policy.premiumMode',
  'policy.illustratedRate',
  'policy.payYears',
  'policy.termLength',
  'agent.name',
  'agent.phone',
];

const projectionFieldPathToKey = {
  'projections[].year': 'year',
  'projections[].age': 'age',
  'projections[].policyValue': 'policyValue',
  'projections[].cashSurrenderValue': 'cashSurrenderValue',
  'projections[].cashValue': 'cashValue',
  'projections[].deathBenefit': 'deathBenefit',
} satisfies Partial<Record<IllustrationFieldPath, keyof IllustrationProjectionExtract>>;

function evidenceItemsForField(
  evidence: Record<string, IllustrationEvidenceSnippet>,
  fieldPath: IllustrationFieldPath,
) {
  return Object.values(evidence)
    .filter(item => item.fieldPath === fieldPath && item.text.trim());
}

function evidenceValueCandidates(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const stripped = stripLeadingEvidenceLabel(normalized);
  return Array.from(new Set([stripped, normalized].filter(Boolean)));
}

function evidenceTransformsForFieldPath(fieldPath: IllustrationFieldPath): JsonObject {
  if (fieldPath === 'client.gender') return { gender: true };
  if (fieldPath === 'agent.phone') return { phone: true };
  if (fieldPath === 'policy.illustratedRate') return { percent: true };
  if (
    fieldPath === 'policy.faceAmount'
    || fieldPath === 'policy.monthlyPremium'
    || fieldPath === 'projections[].policyValue'
    || fieldPath === 'projections[].cashSurrenderValue'
    || fieldPath === 'projections[].cashValue'
    || fieldPath === 'projections[].deathBenefit'
  ) {
    return { currency: true };
  }
  return {};
}

function hasScalarExtractValue(extract: IllustrationExtract, fieldPath: IllustrationFieldPath) {
  switch (fieldPath) {
    case 'carrier':
      return Boolean(extract.carrier.trim());
    case 'productName':
      return Boolean(extract.productName.trim());
    case 'productType':
      return isIllustrationProductType(extract.productType);
    case 'client.fullName':
      return Boolean(extract.client.fullName.trim());
    case 'client.age':
      return typeof extract.client.age === 'number' && Number.isFinite(extract.client.age) && extract.client.age > 0;
    case 'client.gender':
      return isIllustrationGender(extract.client.gender);
    case 'client.state':
      return Boolean(extract.client.state?.trim());
    case 'client.riskClass':
      return Boolean(extract.client.riskClass?.trim());
    case 'policy.faceAmount':
      return typeof extract.policy.faceAmount === 'number' && Number.isFinite(extract.policy.faceAmount) && extract.policy.faceAmount > 0;
    case 'policy.monthlyPremium':
      return typeof extract.policy.monthlyPremium === 'number' && Number.isFinite(extract.policy.monthlyPremium) && extract.policy.monthlyPremium > 0;
    case 'policy.premiumMode':
      return isIllustrationPremiumMode(extract.policy.premiumMode);
    case 'policy.illustratedRate':
      return typeof extract.policy.illustratedRate === 'number' && Number.isFinite(extract.policy.illustratedRate) && extract.policy.illustratedRate > 0;
    case 'policy.payYears':
      return typeof extract.policy.payYears === 'number' && Number.isFinite(extract.policy.payYears) && extract.policy.payYears > 0;
    case 'policy.termLength':
      return typeof extract.policy.termLength === 'number' && Number.isFinite(extract.policy.termLength) && extract.policy.termLength > 0;
    case 'agent.name':
      return Boolean(extract.agent?.name?.trim());
    case 'agent.phone':
      return Boolean(extract.agent?.phone?.trim());
    default:
      return true;
  }
}

function validMaterializedScalar(fieldPath: IllustrationFieldPath, value: string | number | undefined) {
  if (value == null || value === '') return false;
  if (fieldPath === 'productType') return isIllustrationProductType(value);
  if (fieldPath === 'client.gender') return isIllustrationGender(value);
  if (fieldPath === 'policy.premiumMode') return isIllustrationPremiumMode(value);
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return value.trim().length > 0;
}

function materializedScalarFromEvidence(fieldPath: IllustrationFieldPath, text: string) {
  for (const candidate of evidenceValueCandidates(text)) {
    if (fieldPath === 'policy.illustratedRate') {
      const currentRate = candidate.match(/Current Projections[\s\S]{0,180}?(?:Interest Rate\s+\d+(?:\.\d+)?%\s+){2}Interest Rate\s+(\d+(?:\.\d+)?)\s*%/i);
      const currentRateValue = currentRate ? parseMappingNumber(currentRate[1]) : undefined;
      if (validMaterializedScalar(fieldPath, currentRateValue)) return currentRateValue;
    }
    const value = normalizeFieldValue(fieldPath, candidate, evidenceTransformsForFieldPath(fieldPath));
    if (validMaterializedScalar(fieldPath, value)) return value;
  }
  return undefined;
}

function setScalarExtractValue(
  extract: IllustrationExtract,
  fieldPath: IllustrationFieldPath,
  value: string | number,
) {
  switch (fieldPath) {
    case 'carrier':
      if (typeof value === 'string') extract.carrier = value;
      break;
    case 'productName':
      if (typeof value === 'string') extract.productName = value;
      break;
    case 'productType':
      if (isIllustrationProductType(value)) extract.productType = value;
      break;
    case 'client.fullName':
      if (typeof value === 'string') extract.client.fullName = value;
      break;
    case 'client.age':
      if (typeof value === 'number') extract.client.age = value;
      break;
    case 'client.gender':
      if (isIllustrationGender(value)) extract.client.gender = value;
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
      if (isIllustrationPremiumMode(value)) extract.policy.premiumMode = value;
      break;
    case 'policy.illustratedRate':
      if (typeof value === 'number') extract.policy.illustratedRate = value;
      break;
    case 'policy.payYears':
      if (typeof value === 'number') extract.policy.payYears = value;
      break;
    case 'policy.termLength':
      if (typeof value === 'number') extract.policy.termLength = value;
      break;
    case 'agent.name':
      if (typeof value === 'string') {
        extract.agent = { ...(extract.agent || {}), name: value };
      }
      break;
    case 'agent.phone':
      if (typeof value === 'string') {
        extract.agent = { ...(extract.agent || {}), phone: value };
      }
      break;
  }
}

function materializeScalarEvidenceFields(extract: IllustrationExtract) {
  for (const fieldPath of scalarEvidenceFieldPaths) {
    if (hasScalarExtractValue(extract, fieldPath)) continue;
    for (const evidence of evidenceItemsForField(extract.evidence, fieldPath)) {
      const value = materializedScalarFromEvidence(fieldPath, evidence.text);
      if (value == null || value === '') continue;
      setScalarExtractValue(extract, fieldPath, value);
      break;
    }
  }
}

function evidenceNumbers(text: string, fieldPath: IllustrationFieldPath) {
  const candidates = evidenceValueCandidates(text);
  const values: number[] = [];
  for (const candidate of candidates) {
    const matches = candidate.match(/-?\$?\s*\d[\d,]*(?:\.\d+)?/g) || [];
    for (const match of matches) {
      const value = parseMappingNumber(match);
      if (validMaterializedScalar(fieldPath, value)) values.push(value);
    }
    if (values.length) break;
  }
  return values;
}

function hasProjectionValue(projection: Partial<IllustrationProjectionExtract>, key: keyof IllustrationProjectionExtract) {
  const value = projection[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function materializeProjectionEvidenceFields(extract: IllustrationExtract) {
  const projections = extract.projections?.map(projection => ({ ...projection })) || [];
  const patches: Array<Partial<IllustrationProjectionExtract>> = [];

  for (const [fieldPath, key] of Object.entries(projectionFieldPathToKey) as Array<[IllustrationFieldPath, keyof IllustrationProjectionExtract]>) {
    const values = evidenceItemsForField(extract.evidence, fieldPath)
      .flatMap(evidence => evidenceNumbers(evidence.text, fieldPath));
    values.forEach((value, index) => {
      patches[index] = patches[index] || {};
      if (!hasProjectionValue(projections[index] || {}, key)) {
        patches[index][key] = value;
      }
    });
  }

  patches.forEach((patch, index) => {
    const current = projections[index] || {};
    projections[index] = { ...current, ...patch } as IllustrationProjectionExtract;
  });

  const materialized = projections.filter(
    (projection): projection is IllustrationProjectionExtract => hasProjectionValue(projection, 'age'),
  );
  if (materialized.length) {
    extract.projections = materialized;
  }
}

export function materializeExtractFromEvidence(extract: IllustrationExtract): IllustrationExtract {
  const materialized: IllustrationExtract = {
    ...extract,
    client: { ...extract.client },
    policy: { ...extract.policy },
    agent: extract.agent ? { ...extract.agent } : undefined,
    projections: extract.projections?.map(projection => ({ ...projection })),
  };

  materializeScalarEvidenceFields(materialized);
  materializeProjectionEvidenceFields(materialized);

  return materialized;
}

export function repairExtractFromEvidence(extract: IllustrationExtract): IllustrationExtract {
  return materializeExtractFromEvidence(extract);
}

const currencyFieldPaths = new Set<IllustrationFieldPath>([
  'policy.faceAmount',
  'policy.monthlyPremium',
  'projections[].policyValue',
  'projections[].cashSurrenderValue',
  'projections[].cashValue',
  'projections[].deathBenefit',
]);

const numberFieldPaths = new Set<IllustrationFieldPath>([
  'client.age',
  'policy.illustratedRate',
  'policy.payYears',
  'policy.termLength',
  'projections[].year',
  'projections[].age',
]);

function extractedScalarValue(extract: IllustrationExtract, fieldPath: IllustrationFieldPath) {
  switch (fieldPath) {
    case 'carrier':
      return extract.carrier;
    case 'productName':
      return extract.productName;
    case 'productType':
      return extract.productType;
    case 'client.fullName':
      return extract.client.fullName;
    case 'client.age':
      return extract.client.age;
    case 'client.gender':
      return extract.client.gender;
    case 'client.state':
      return extract.client.state;
    case 'client.riskClass':
      return extract.client.riskClass;
    case 'policy.faceAmount':
      return extract.policy.faceAmount;
    case 'policy.monthlyPremium':
      return extract.policy.monthlyPremium;
    case 'policy.premiumMode':
      return extract.policy.premiumMode;
    case 'policy.illustratedRate':
      return extract.policy.illustratedRate;
    case 'policy.payYears':
      return extract.policy.payYears;
    case 'policy.termLength':
      return extract.policy.termLength;
    case 'agent.name':
      return extract.agent?.name;
    case 'agent.phone':
      return extract.agent?.phone;
    default:
      return undefined;
  }
}

function equivalentReplayValue(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = typeof left === 'number' ? left : Number(left);
    const rightNumber = typeof right === 'number' ? right : Number(right);
    return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && Math.abs(leftNumber - rightNumber) < 0.0001;
  }
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}

function mappingReplaysExpected(
  pdf: PdfExtractionResult,
  extract: IllustrationExtract,
  mapping: IllustrationProfileFieldMapping,
) {
  const expected = extractedScalarValue(extract, mapping.fieldPath);
  if (expected == null || expected === '') return false;
  const replay = extractProfileField(mapping, pdf);
  return Boolean(replay && equivalentReplayValue(replay.value, expected));
}

function selectorWithEvidencePage(
  selector: JsonObject,
  evidence?: IllustrationEvidenceSnippet,
) {
  if (!evidence || typeof selector.pageHint === 'number') return selector;
  return { ...selector, pageHint: evidence.page } as JsonObject;
}

function regexForFieldPath(fieldPath: IllustrationFieldPath, evidence?: IllustrationEvidenceSnippet) {
  if (fieldPath === 'client.fullName') {
    return "(?:Name|Designed\\s+For|Prepared\\s+For)\\s*:?\\s*(?<value>[A-Z][A-Za-z' .-]*?)(?:\\s+(?:Female|Male|M|F)\\b|\\s+\\d{1,3}\\b|$)";
  }
  if (fieldPath === 'client.gender') return '(?<value>Female|Male|F|M)';
  if (fieldPath === 'policy.premiumMode') return '(?<value>Monthly|Annual|Quarterly|Month|Yearly)';
  if (fieldPath === 'policy.illustratedRate') {
    return 'Current Projections[\\s\\S]{0,180}?(?:Interest Rate\\s+\\d+(?:\\.\\d+)?%\\s+){2}Interest Rate\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*%|(?:Illustrated Rates?|Interest Rate):?\\s*(\\d+(?:\\.\\d+)?)\\s*%';
  }
  if (fieldPath === 'policy.payYears') return '(?<value>\\d{1,3})\\s*Pay';
  if (fieldPath === 'policy.termLength') return '(?<value>\\d{1,3})\\s*(?:Year|Yr|Term)';
  if (currencyFieldPaths.has(fieldPath)) {
    return evidence?.text.includes('$')
      ? '\\$\\s*(?<value>[\\d,]+(?:\\.\\d+)?)'
      : '(?<value>\\d[\\d,]*(?:\\.\\d+)?)';
  }
  if (numberFieldPaths.has(fieldPath)) return '\\b(?<value>\\d{1,3})\\b';
  return '';
}

function transformForFieldPath(fieldPath: IllustrationFieldPath, transformRules: JsonObject) {
  if (currencyFieldPaths.has(fieldPath)) return { ...transformRules, currency: true } as JsonObject;
  if (fieldPath === 'policy.illustratedRate') return { ...transformRules, percent: true } as JsonObject;
  if (fieldPath === 'client.gender') return { ...transformRules, gender: true } as JsonObject;
  if (fieldPath === 'agent.phone') return { ...transformRules, phone: true } as JsonObject;
  return transformRules;
}

function evidenceLabel(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  const beforeValue = compact.split(/\$?\s*\d[\d,]*(?:\.\d+)?/)[0]?.trim() || '';
  const label = beforeValue.replace(/[\s:;,.\\/-]+$/, '').trim();
  return /[A-Za-z]/.test(label) && label.length <= 80 ? label : '';
}

function fallbackLabelsForFieldPath(fieldPath: IllustrationFieldPath, evidence?: IllustrationEvidenceSnippet) {
  const labels = [
    evidence ? evidenceLabel(evidence.text) : '',
    fieldPath === 'client.fullName' ? 'Name:' : '',
    fieldPath === 'client.fullName' ? 'Designed For:' : '',
    fieldPath === 'policy.faceAmount' ? 'Face Amount:' : '',
    fieldPath === 'policy.faceAmount' ? 'Initial Face Amount:' : '',
    fieldPath === 'policy.faceAmount' ? 'Death Protection' : '',
    fieldPath === 'policy.monthlyPremium' ? 'Initial Premium:' : '',
    fieldPath === 'policy.monthlyPremium' ? 'Initial Monthly Premium:' : '',
    fieldPath === 'policy.monthlyPremium' ? 'Monthly Premium:' : '',
    fieldPath === 'policy.premiumMode' ? 'Initial Premium:' : '',
    fieldPath === 'policy.illustratedRate' ? 'Illustrated Rate:' : '',
    fieldPath === 'policy.illustratedRate' ? 'Interest Rate' : '',
    fieldPath === 'policy.illustratedRate' ? 'Current Projections' : '',
    fieldPath === 'policy.payYears' ? 'Pay' : '',
    fieldPath === 'policy.termLength' ? 'Term' : '',
    fieldPath === 'agent.name' ? 'Prepared By' : '',
    fieldPath === 'agent.name' ? 'Agent:' : '',
  ].filter(Boolean);
  return Array.from(new Set(labels));
}

function hardenFieldMapping(
  mapping: IllustrationProfileFieldMapping,
  evidence?: IllustrationEvidenceSnippet,
) {
  const selector = selectorWithEvidencePage(mapping.sourceSelector || {}, evidence);
  const regex = typeof selector.regex === 'string' && selector.regex.trim()
    ? selector.regex.trim()
    : regexForFieldPath(mapping.fieldPath, evidence);
  return {
    ...mapping,
    sourceSelector: regex ? { ...selector, regex } as JsonObject : selector,
    transformRules: transformForFieldPath(mapping.fieldPath, mapping.transformRules || {}),
  };
}

function fallbackFieldMappings(
  mapping: IllustrationProfileFieldMapping,
  evidence?: IllustrationEvidenceSnippet,
) {
  const regex = regexForFieldPath(mapping.fieldPath, evidence);
  if (!regex) return [];
  const pageHint = evidence?.page;
  return fallbackLabelsForFieldPath(mapping.fieldPath, evidence).map(label => hardenFieldMapping({
    ...mapping,
    sourceStrategy: 'label_value',
    sourceSelector: {
      label,
      regex,
      ...(pageHint ? { pageHint } : {}),
      valuePosition: 'after',
    } as JsonObject,
    transformRules: transformForFieldPath(mapping.fieldPath, mapping.transformRules || {}),
  }, evidence));
}

export function hardenFieldMappingsFromEvidence(
  pdf: PdfExtractionResult,
  extract: IllustrationExtract,
  fieldMappings: IllustrationProfileFieldMapping[],
) {
  return fieldMappings.map(mapping => {
    const evidence = evidenceItemsForField(extract.evidence, mapping.fieldPath)[0];
    const hardened = hardenFieldMapping(mapping, evidence);
    if (mappingReplaysExpected(pdf, extract, hardened)) return hardened;
    for (const fallback of fallbackFieldMappings(mapping, evidence)) {
      if (mappingReplaysExpected(pdf, extract, fallback)) return fallback;
    }
    return hardened;
  });
}

function buildProposal(
  input: OpenAIIllustrationTrainingInput,
  modelName: string,
  generated: GeneratedTrainingOutput,
): IllustrationTrainingProposal {
  const productType = input.productType || generated.productType;
  if (!isIllustrationProductType(productType)) {
    fail(500, 'invalid_openai_output', 'OpenAI returned an invalid product type.');
  }

  const extract = repairExtractFromEvidence({
    profileId: input.profileId,
    profileVersionId: input.profileVersionId,
    carrier: input.carrier || generated.carrier,
    productName: input.productName || generated.productName,
    productType,
    client: {
      fullName: generated.client.fullName || '',
      age: optionalNumber(generated.client.age),
      gender: isIllustrationGender(generated.client.gender) ? generated.client.gender : undefined,
      state: optionalString(generated.client.state),
      riskClass: optionalString(generated.client.riskClass),
    },
    policy: {
      faceAmount: optionalNumber(generated.policy.faceAmount),
      monthlyPremium: optionalNumber(generated.policy.monthlyPremium),
      premiumMode: isIllustrationPremiumMode(generated.policy.premiumMode) ? generated.policy.premiumMode : undefined,
      illustratedRate: optionalNumber(generated.policy.illustratedRate),
      payYears: optionalNumber(generated.policy.payYears),
      termLength: optionalNumber(generated.policy.termLength),
    },
    projections: generated.projections.map(projection => ({
      year: optionalNumber(projection.year),
      age: projection.age,
      policyValue: optionalNumber(projection.policyValue),
      cashSurrenderValue: optionalNumber(projection.cashSurrenderValue),
      cashValue: optionalNumber(projection.cashValue),
      deathBenefit: optionalNumber(projection.deathBenefit),
    })),
    agent: {
      name: optionalString(generated.agent.name),
      phone: optionalString(generated.agent.phone),
    },
    evidence: evidenceRecord(generated.evidence),
    fieldConfidence: fieldConfidence(generated.fieldConfidence),
    extractionConfidence: cleanConfidence(generated.confidence),
    schemaVersion: ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  });

  const fieldMappings = hardenFieldMappingsFromEvidence(
    input.pdf,
    extract,
    generated.fieldMappings.map(mapping => sanitizeRuntimeFieldMapping({
      fieldPath: mapping.fieldPath,
      sourceStrategy: mapping.sourceStrategy,
      sourceSelector: cleanSelector(mapping.sourceSelector),
      transformRules: cleanTransform(mapping.transformRules),
      required: requiredRuntimeFieldPath(productType, mapping.fieldPath),
      minConfidence: cleanConfidence(mapping.minConfidence, 0.8),
      notes: mapping.notes,
    })),
  );
  const validation = validateIllustrationExtract(extract);
  return {
    profileId: input.profileId,
    profileVersionId: input.profileVersionId,
    exampleId: input.exampleId,
    modelProvider: 'openai',
    modelName,
    normalizedExtract: extract,
    fingerprints: generated.fingerprints.map(fingerprint => ({
      fingerprintType: fingerprint.fingerprintType,
      matchStrategy: fingerprint.matchStrategy,
      value: fingerprint.value,
      pageHint: optionalNumber(fingerprint.pageHint) ?? null,
      required: stableRequiredFingerprintType(fingerprint.fingerprintType),
      weight: Math.max(0, fingerprint.weight),
      confidence: cleanConfidence(fingerprint.confidence),
      evidenceSnippet: fingerprint.evidenceSnippet.slice(0, 500),
    })),
    fieldMappings,
    projectionMappings: generated.projectionMappings.map(mapping => sanitizeRuntimeProjectionMapping({
      projectionKey: mapping.projectionKey,
      sourceStrategy: mapping.sourceStrategy,
      rowSelector: cleanSelector(mapping.rowSelector),
      columnMappings: cleanSelector(mapping.columnMappings),
      valueMappings: cleanSelector(mapping.valueMappings),
      transformRules: cleanTransform(mapping.transformRules),
      required: mapping.required,
      minConfidence: cleanConfidence(mapping.minConfidence, 0.8),
      notes: mapping.notes,
    })),
    confidence: cleanConfidence(generated.confidence),
    issues: validation.ok ? [] : validation.issues,
  };
}

async function attemptProposal(modelName: string, input: OpenAIIllustrationTrainingInput): Promise<ProposalAttemptResult> {
  try {
    const response = await openAIRequest(modelName, input);
    const generated = JSON.parse(responseText(response)) as GeneratedTrainingOutput;
    const proposal = buildProposal(input, modelName, generated);
    return {
      ok: true,
      modelName,
      proposal,
      validationOk: proposal.issues.length === 0,
    };
  } catch (error) {
    return {
      ok: false,
      modelName,
      code: 'extraction_failed',
      message: error instanceof Error ? error.message : 'OpenAI extraction failed.',
    };
  }
}

export async function generateIllustrationTrainingProposal(
  input: OpenAIIllustrationTrainingInput,
): Promise<IllustrationAdminTrainResponse> {
  requireOpenAIConfig();

  let bestNeedsReview: IllustrationTrainingProposal | null = null;
  let lastFailure: ProposalAttemptResult | null = null;

  for (const modelName of modelSequence(input.useFastModel)) {
    const result = await attemptProposal(modelName, input);
    if (result.ok && result.validationOk) {
      return {
        status: 'succeeded',
        proposal: result.proposal,
      };
    }
    if (result.ok) {
      bestNeedsReview = result.proposal;
      continue;
    }
    lastFailure = result;
  }

  if (bestNeedsReview) {
    return {
      status: 'needs_review',
      proposal: bestNeedsReview,
      message: 'OpenAI returned a structured proposal, but normalized output needs admin review before it can become a training draft.',
    };
  }

  return {
    status: 'failed',
    code: lastFailure?.ok === false ? lastFailure.code : 'extraction_failed',
    message: lastFailure?.ok === false ? lastFailure.message : 'OpenAI extraction failed.',
  };
}
