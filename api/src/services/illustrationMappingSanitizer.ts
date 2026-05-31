import {
  type IllustrationProfileFieldMapping,
  type IllustrationProfileProjectionMapping,
  type JsonObject,
} from '../types/illustration';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripLiteralSelectorValue(selector: unknown): JsonObject {
  if (!isRecord(selector)) return {};
  const sanitized = { ...selector };
  delete sanitized.value;
  return sanitized as JsonObject;
}

function isProjectionFieldMapping(mapping: IllustrationProfileFieldMapping) {
  return mapping.fieldPath.startsWith('projections[].');
}

export function sanitizeRuntimeFieldMapping(mapping: IllustrationProfileFieldMapping): IllustrationProfileFieldMapping {
  if (mapping.sourceStrategy === 'constant' || mapping.sourceStrategy === 'manual') {
    return mapping;
  }
  return {
    ...mapping,
    required: isProjectionFieldMapping(mapping) ? false : mapping.required,
    sourceSelector: stripLiteralSelectorValue(mapping.sourceSelector),
  };
}

export function sanitizeRuntimeProjectionMapping(mapping: IllustrationProfileProjectionMapping): IllustrationProfileProjectionMapping {
  if (mapping.sourceStrategy === 'manual') {
    return mapping;
  }
  return {
    ...mapping,
    rowSelector: stripLiteralSelectorValue(mapping.rowSelector),
    columnMappings: stripLiteralSelectorValue(mapping.columnMappings),
    valueMappings: stripLiteralSelectorValue(mapping.valueMappings),
  };
}
