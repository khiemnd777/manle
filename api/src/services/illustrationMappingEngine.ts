import {
  type IllustrationEvidenceSnippet,
  type IllustrationFieldPath,
  type IllustrationProfileFieldMapping,
  type JsonObject,
  type PdfExtractionResult,
} from '../types/illustration';

export type FieldExtractionResult = {
  fieldPath: IllustrationFieldPath;
  value: string | number;
  evidence: IllustrationEvidenceSnippet;
  confidence: number;
};

type RawExtractionResult = {
  value: string;
  evidence: IllustrationEvidenceSnippet;
};

type LabelValueCandidate = RawExtractionResult & {
  direction: 'after' | 'next' | 'previous' | 'window_after' | 'window_before';
  distance: number;
  lineHintMatched: boolean;
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

export function parseMappingPattern(value: string) {
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function labelPattern(value: string) {
  const tokens = normalizedSearchText(value).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const requiresExplicitDelimiter = tokens.length === 1 && /:\s*$/.test(value.trim());
  const delimiter = requiresExplicitDelimiter ? '\\s*:' : '\\s*[:;,.\\-]?';
  return new RegExp(`\\b${tokens.map(escapeRegExp).join('[\\s:;,.\\-/]+')}${delimiter}`, 'i');
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
  const pattern = parseMappingPattern(patternText);
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

function captureRegexValue(patternText: string, text: string) {
  const pattern = parseMappingPattern(patternText);
  if (!pattern) return null;
  const match = pattern.exec(text);
  if (!match) return null;
  const value = firstCapture(match).trim();
  return value || null;
}

function cleanAdjacentValue(value?: string) {
  return (value || '').replace(/^[\s:;\-.]+/, '').replace(/[\s:;\-.]+$/, '').trim();
}

function labelWindowSize(mapping: IllustrationProfileFieldMapping, selector: JsonObject) {
  return Math.max(
    1,
    Math.min(
      20,
      selectorNumber(selector, 'searchWindow')
        ?? selectorNumber(selector, 'windowLines')
        ?? (isNumericMapping(mapping) ? 10 : 2),
    ),
  );
}

function isPositionalHint(value: string) {
  const normalized = normalizedSearchText(value);
  return normalized === 'same'
    || normalized === 'next'
    || normalized === 'previous'
    || normalized === 'before'
    || normalized === 'after';
}

function pushLabelCandidate(
  candidates: LabelValueCandidate[],
  value: string | undefined,
  line: { page: number; text: string } | undefined,
  direction: LabelValueCandidate['direction'],
  distance: number,
  lineHintMatched: boolean,
) {
  const cleanValue = cleanAdjacentValue(value);
  if (!cleanValue || !line) return;
  candidates.push({
    direction,
    distance,
    lineHintMatched,
    value: cleanValue,
    evidence: {
      page: line.page,
      text: line.text,
      confidence: Math.max(0.68, 0.84 - Math.min(distance, 10) * 0.02),
      source: 'pdf_text',
    },
  });
}

function labelValueCandidates(mapping: IllustrationProfileFieldMapping, selector: JsonObject, pdf: PdfExtractionResult): LabelValueCandidate[] {
  const label = selectorString(selector, 'label') || selectorString(selector, 'lineHint');
  const pattern = label ? labelPattern(label) : null;
  if (!pattern) return [];
  const pageHint = selectorNumber(selector, 'pageHint');
  const lineHint = selectorString(selector, 'lineHint');
  const normalizedLineHint = normalizedSearchText(lineHint);
  const shouldApplyLineHint = Boolean(normalizedLineHint && !isPositionalHint(lineHint));
  const lines = pageLines(pdf, pageHint);
  const searchWindow = labelWindowSize(mapping, selector);
  const candidates: LabelValueCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = pattern.exec(line.text);
    if (!match) continue;
    const lineHintMatched = shouldApplyLineHint
      ? normalizedSearchText(line.text).includes(normalizedLineHint)
      : true;
    pushLabelCandidate(candidates, line.text.slice(match.index + match[0].length), line, 'after', 0, lineHintMatched);
    for (let distance = 1; distance <= searchWindow; distance += 1) {
      const previous = lines[index - distance];
      const next = lines[index + distance];
      pushLabelCandidate(candidates, previous?.text, previous, distance === 1 ? 'previous' : 'window_before', distance, lineHintMatched);
      pushLabelCandidate(candidates, next?.text, next, distance === 1 ? 'next' : 'window_after', distance, lineHintMatched);
    }
  }

  return candidates;
}

function isNumericMapping(mapping: IllustrationProfileFieldMapping) {
  const transforms = mapping.transformRules || {};
  return numericFieldPaths.has(mapping.fieldPath)
    || transforms.currency === true
    || transforms.percent === true;
}

function numericCandidateRank(value: string) {
  const trimmed = value.trim();
  if (/^\(?-?\$?\s*\d[\d,]*(?:\.\d+)?\)?\s*%?$/.test(trimmed)) return 0;
  if (/^\(?-?\d[\d,]*(?:\.\d+)?\)?\s*(?:dollars?|usd)?$/i.test(trimmed)) return 1;
  if (/\$/.test(trimmed)) return 2;
  if (/[a-z]{2,}.*\d|\d.*[a-z]{2,}/i.test(trimmed)) return 5;
  return 3;
}

function labelDirectionRank(direction: LabelValueCandidate['direction'], mapping: IllustrationProfileFieldMapping, selector: JsonObject) {
  const requestedPosition = selectorString(selector, 'valuePosition') || selectorString(selector, 'position');
  if (requestedPosition === 'before') {
    if (direction === 'previous' || direction === 'window_before') return 0;
    if (direction === 'after') return 1;
    return 2;
  }
  if (requestedPosition === 'after') {
    if (direction === 'after') return 0;
    if (direction === 'next' || direction === 'window_after') return 1;
    return 2;
  }
  if (direction === 'after') return 0;
  if (isNumericMapping(mapping)) return direction === 'previous' || direction === 'window_before' ? 1 : 2;
  return direction === 'next' || direction === 'window_after' ? 1 : 2;
}

function regexConstrainedLabelCandidate(
  mapping: IllustrationProfileFieldMapping,
  selector: JsonObject,
  candidate: LabelValueCandidate,
): RawExtractionResult | null {
  const regex = selectorString(selector, 'regex');
  if (!regex) return null;
  const sources = [candidate.value, candidate.evidence.text]
    .map(value => value.trim())
    .filter(Boolean);

  for (const source of sources) {
    const captured = captureRegexValue(regex, source);
    if (!captured) continue;
    const value = normalizeFieldValue(mapping.fieldPath, captured, mapping.transformRules || {});
    if (value != null && value !== '') {
      return {
        value: captured,
        evidence: candidate.evidence,
      };
    }
  }

  return null;
}

function labelValue(mapping: IllustrationProfileFieldMapping, selector: JsonObject, pdf: PdfExtractionResult): RawExtractionResult | null {
  const numericMapping = isNumericMapping(mapping);
  const regex = selectorString(selector, 'regex');
  const candidates = labelValueCandidates(mapping, selector, pdf)
    .sort((left, right) => {
      if (left.lineHintMatched !== right.lineHintMatched) return left.lineHintMatched ? -1 : 1;
      if (regex) {
        const directionRank = labelDirectionRank(left.direction, mapping, selector) - labelDirectionRank(right.direction, mapping, selector);
        if (directionRank !== 0) return directionRank;
      }
      if (numericMapping) {
        const numericRank = numericCandidateRank(left.value) - numericCandidateRank(right.value);
        if (numericRank !== 0) return numericRank;
        const distanceRank = left.distance - right.distance;
        if (distanceRank !== 0) return distanceRank;
      }
      if (left.direction === 'after' && right.direction !== 'after') return -1;
      if (right.direction === 'after' && left.direction !== 'after') return 1;
      return labelDirectionRank(left.direction, mapping, selector) - labelDirectionRank(right.direction, mapping, selector);
    });

  if (regex) {
    for (const candidate of candidates) {
      const constrained = regexConstrainedLabelCandidate(mapping, selector, candidate);
      if (constrained) return constrained;
    }
    return null;
  }

  for (const candidate of candidates) {
    const value = normalizeFieldValue(mapping.fieldPath, candidate.value, mapping.transformRules || {});
    if (value != null && value !== '') return candidate;
  }
  return candidates[0] || null;
}

function rowPatternValue(selector: JsonObject, pdf: PdfExtractionResult): RawExtractionResult | null {
  const pageHint = selectorNumber(selector, 'pageHint');
  const pattern = selectorString(selector, 'regex') || selectorString(selector, 'rowPattern');
  if (pattern) {
    return regexValue(pattern, pageText(pdf, pageHint), pdf, pageHint);
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
    return labelValue(mapping, selector, pdf);
  }
  return null;
}

export function parseMappingNumber(value: string) {
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

export function normalizeFieldValue(path: IllustrationFieldPath, rawValue: string, transforms: JsonObject): string | number | undefined {
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
  if (path === 'client.age') {
    const numeric = parseMappingNumber(value);
    if (numeric == null || numeric <= 0 || numeric > 120) return undefined;
    if (/[$,]/.test(value)) return undefined;
    return numeric;
  }
  if (path === 'policy.payYears' || path === 'policy.termLength') {
    const numeric = parseMappingNumber(value);
    if (numeric == null || numeric <= 0 || numeric > 100) return undefined;
    if (/[$,]/.test(value)) return undefined;
    const hasLetters = /[a-z]/i.test(value);
    const hasYearContext = /\b(?:years?|yrs?|term|duration|pay|pay\s*years?)\b/i.test(value);
    return !hasLetters || hasYearContext ? numeric : undefined;
  }
  if (numericFieldPaths.has(path) || transforms.currency === true || transforms.percent === true) {
    return parseMappingNumber(value);
  }
  if (path === 'agent.name') {
    return value
      .replace(/\s+(?:TP|total premium|target premium)\s*:.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (transforms.phone === true) return value.replace(/\s+/g, ' ');
  return value.replace(/\s+/g, ' ');
}

export function extractProfileField(mapping: IllustrationProfileFieldMapping, pdf: PdfExtractionResult): FieldExtractionResult | null {
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
