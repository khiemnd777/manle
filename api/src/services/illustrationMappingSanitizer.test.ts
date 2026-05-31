import { expect, test } from 'bun:test';
import type {
  IllustrationProfileFieldMapping,
  IllustrationProfileProjectionMapping,
} from '../types/illustration';
import {
  sanitizeRuntimeFieldMapping,
  sanitizeRuntimeProjectionMapping,
} from './illustrationMappingSanitizer';

test('strips literal selector values from runtime field mappings', () => {
  const mapping: IllustrationProfileFieldMapping = {
    fieldPath: 'client.fullName',
    sourceStrategy: 'label_value',
    sourceSelector: {
      label: 'Designed For',
      value: 'Cindy Ngoc Phuong',
      pageHint: 1,
    },
    transformRules: {},
    required: true,
    minConfidence: 0.8,
  };

  const sanitized = sanitizeRuntimeFieldMapping(mapping);

  expect(sanitized.sourceSelector.value).toBeUndefined();
  expect(sanitized.sourceSelector.label).toBe('Designed For');
});

test('keeps literal values only for constant field mappings', () => {
  const mapping: IllustrationProfileFieldMapping = {
    fieldPath: 'policy.premiumMode',
    sourceStrategy: 'constant',
    sourceSelector: {
      value: 'monthly',
    },
    transformRules: {},
    required: false,
    minConfidence: 1,
  };

  expect(sanitizeRuntimeFieldMapping(mapping).sourceSelector.value).toBe('monthly');
});

test('projection field mappings are never required scalar runtime gates', () => {
  const mapping: IllustrationProfileFieldMapping = {
    fieldPath: 'projections[].age',
    sourceStrategy: 'table_cell',
    sourceSelector: {
      regex: '^\\d+$',
      pageHint: 8,
    },
    transformRules: {},
    required: true,
    minConfidence: 0.8,
  };

  const sanitized = sanitizeRuntimeFieldMapping(mapping);

  expect(sanitized.required).toBe(false);
});

test('strips literal selector values from runtime projection mappings', () => {
  const mapping: IllustrationProfileProjectionMapping = {
    projectionKey: 'projections[]',
    sourceStrategy: 'table',
    rowSelector: {
      label: 'Year',
      value: '1',
      pageHint: 8,
    },
    columnMappings: {
      tableHeader: 'Policy Value',
      value: '2150',
    },
    valueMappings: {
      rowPattern: '^1\\s+',
      value: '2150',
    },
    transformRules: {},
    required: true,
    minConfidence: 0.8,
  };

  const sanitized = sanitizeRuntimeProjectionMapping(mapping);

  expect(sanitized.rowSelector.value).toBeUndefined();
  expect(sanitized.columnMappings.value).toBeUndefined();
  expect(sanitized.valueMappings.value).toBeUndefined();
});
