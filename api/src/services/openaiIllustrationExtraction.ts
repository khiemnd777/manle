import { config } from '../config';
import { fail } from '../http/errors';
import {
  ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  isConfidence,
  isIllustrationGender,
  isIllustrationPremiumMode,
  isIllustrationProductType,
  validateIllustrationExtract,
  type IllustrationAdminTrainResponse,
  type IllustrationEvidenceSnippet,
  type IllustrationFieldPath,
  type IllustrationProfileFieldMapping,
  type IllustrationProfileFingerprint,
  type IllustrationProfileProjectionMapping,
  type IllustrationProductType,
  type IllustrationRuntimeErrorCode,
  type IllustrationTrainingProposal,
  type JsonObject,
  type PdfExtractionResult,
} from '../types/illustration';

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
  required: ['label', 'regex', 'pageHint', 'lineHint', 'tableHeader', 'columnName', 'rowPattern', 'value'],
  properties: {
    label: nullableString(),
    regex: nullableString(),
    pageHint: nullableNumber(),
    lineHint: nullableString(),
    tableHeader: nullableString(),
    columnName: nullableString(),
    rowPattern: nullableString(),
    value: nullableString(),
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
      required: ['faceAmount', 'monthlyPremium', 'premiumMode', 'payYears', 'termLength'],
      properties: {
        faceAmount: nullableNumber(),
        monthlyPremium: nullableNumber(),
        premiumMode: { anyOf: [{ type: 'string', enum: ['monthly', 'annual', 'quarterly'] }, { type: 'null' }] },
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

  return [
    'You extract life-insurance illustration fields for MANLE admin training.',
    'Use only values visible in the provided PDF text. Do not infer missing insurance values.',
    'Return conservative mapping proposals that an admin can review before publishing.',
    'Every evidence text must be a short snippet from the PDF text, not the full document.',
    'Fingerprints must distinguish carrier plus product/form/version; do not rely on carrier alone.',
    'Prefer label_value or table_cell mappings when labels/tables are visible; use regex only for stable repeated patterns.',
    profileIdentity ? `Target profile identity:\n${profileIdentity}` : 'Target profile identity: unknown; infer conservatively from the PDF text.',
    `PDF metadata: file=${input.pdf.fileName || 'unknown'}, sha256=${input.pdf.fileSha256}, pages=${input.pdf.pageCount}`,
    `PDF text excerpt:\n${limitedPdfPrompt(input.pdf)}`,
  ].join('\n\n');
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

function buildProposal(
  input: OpenAIIllustrationTrainingInput,
  modelName: string,
  generated: GeneratedTrainingOutput,
): IllustrationTrainingProposal {
  const productType = input.productType || generated.productType;
  if (!isIllustrationProductType(productType)) {
    fail(500, 'invalid_openai_output', 'OpenAI returned an invalid product type.');
  }

  const extract = {
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
  };

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
      required: fingerprint.required,
      weight: Math.max(0, fingerprint.weight),
      confidence: cleanConfidence(fingerprint.confidence),
      evidenceSnippet: fingerprint.evidenceSnippet.slice(0, 500),
    })),
    fieldMappings: generated.fieldMappings.map(mapping => ({
      fieldPath: mapping.fieldPath,
      sourceStrategy: mapping.sourceStrategy,
      sourceSelector: cleanSelector(mapping.sourceSelector),
      transformRules: cleanTransform(mapping.transformRules),
      required: mapping.required,
      minConfidence: cleanConfidence(mapping.minConfidence, 0.8),
      notes: mapping.notes,
    })),
    projectionMappings: generated.projectionMappings.map(mapping => ({
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
