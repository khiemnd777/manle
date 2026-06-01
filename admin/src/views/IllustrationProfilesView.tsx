import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '../api/client';
import type {
  IllustrationEvidenceSnippet,
  IllustrationExtractionRunSummary,
  IllustrationFieldPath,
  IllustrationProductType,
  IllustrationProfileDetail,
  IllustrationProfileFieldMapping,
  IllustrationProfileFingerprint,
  IllustrationProfilePdfUpsertResponse,
  IllustrationProfileProjectionMapping,
  IllustrationProfileSummary,
  IllustrationTrainingExampleSummary,
  IllustrationTrainingAutoFixInput,
  IllustrationTrainingCorrectionInput,
  IllustrationTrainingProposal,
  IllustrationTrainingResponse,
  IllustrationTrainingVerificationReport,
} from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  ActionButton,
  CustomSelect,
  Dialog,
  SortableTh,
  StatusBadge,
  boolField,
  field,
  messageFromError,
  nextSortState,
  sortedRows,
  timestamp,
  useConfirmDialog,
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';
import { illustrationProductTypeOptions } from './options';

type LoadAll = (customerSearch?: string, systemUserSearch?: string, illustrationProfileSearch?: string) => Promise<void>;
type IllustrationProfileSortKey = 'carrier' | 'product' | 'productType' | 'status' | 'activeVersion' | 'updatedAt';
type ReviewMode = 'train' | 'test';
type SubmitAction = ReviewMode | 'saveReview' | 'autoFix' | 'publish' | 'deleteProfile' | 'upsertProfile' | 'logo' | null;
type FingerprintType = IllustrationProfileFingerprint['fingerprintType'];
type FingerprintStrategy = IllustrationProfileFingerprint['matchStrategy'];
type FieldSourceStrategy = IllustrationProfileFieldMapping['sourceStrategy'];
type ProjectionSourceStrategy = IllustrationProfileProjectionMapping['sourceStrategy'];

type FingerprintDraft = {
  include: boolean;
  fingerprintType: FingerprintType;
  matchStrategy: FingerprintStrategy;
  value: string;
  pageHint: string;
  required: boolean;
  weight: number;
  confidence: number;
  evidenceSnippet: string;
};

type FieldMappingDraft = {
  include: boolean;
  fieldPath: IllustrationFieldPath;
  sourceStrategy: FieldSourceStrategy;
  sourceSelectorJson: string;
  transformRulesJson: string;
  required: boolean;
  minConfidence: number;
  notes: string;
};

type ProjectionMappingDraft = {
  include: boolean;
  projectionKey: string;
  sourceStrategy: ProjectionSourceStrategy;
  rowSelectorJson: string;
  columnMappingsJson: string;
  valueMappingsJson: string;
  transformRulesJson: string;
  required: boolean;
  minConfidence: number;
  notes: string;
};

type ReviewDraft = {
  mode: ReviewMode;
  status: Extract<IllustrationTrainingResponse['status'], 'succeeded' | 'needs_review'>;
  message?: string;
  proposal: IllustrationTrainingProposal;
  exampleId?: string;
  runId?: string;
  normalizedExtractJson: string;
  fingerprints: FingerprintDraft[];
  fieldMappings: FieldMappingDraft[];
  projectionMappings: ProjectionMappingDraft[];
};

const illustrationProfileSortAccessors: Record<IllustrationProfileSortKey, (profile: IllustrationProfileSummary) => SortValue> = {
  carrier: profile => profile.carrier,
  product: profile => profile.productName,
  productType: profile => profile.productType,
  status: profile => profile.status,
  activeVersion: profile => profile.activeVersionNumber || 0,
  updatedAt: profile => timestamp(profile.updatedAt),
};

const fieldPathOptions: IllustrationFieldPath[] = [
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

const fingerprintTypeOptions: FingerprintType[] = ['carrier', 'product', 'form', 'version', 'text', 'regex', 'layout'];
const fingerprintStrategyOptions: FingerprintStrategy[] = ['contains', 'equals', 'regex', 'normalized_contains'];
const fieldSourceStrategyOptions: FieldSourceStrategy[] = ['label_value', 'regex', 'table_cell', 'filename', 'constant', 'manual'];
const projectionSourceStrategyOptions: ProjectionSourceStrategy[] = ['table', 'summary_block', 'regex', 'manual'];
const productTypeDetectionOptions = [
  { value: '', label: 'Auto detect' },
  ...illustrationProductTypeOptions,
];

function productTypeLabel(value: IllustrationProductType) {
  return value === 'iul' ? 'IUL' : 'Term Life';
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : '-';
}

function activeVersionLabel(profile: IllustrationProfileSummary) {
  return profile.activeVersionNumber ? `v${profile.activeVersionNumber}` : 'No published version';
}

function versionLine(profile: IllustrationProfileDetail) {
  const draft = profile.draftVersion ? `draft v${profile.draftVersion.versionNumber}` : 'no draft';
  const published = profile.publishedVersion ? `published v${profile.publishedVersion.versionNumber}` : 'no published version';
  return `${draft} / ${published}`;
}

function jsonText(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatPercent(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

function compactJson(value: unknown) {
  if (value == null || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function stripSelectorLiteralValue(selector: Record<string, unknown>) {
  const sanitized = { ...selector };
  delete sanitized.value;
  return sanitized;
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionalPageHint(value: string) {
  const numeric = optionalNumber(value);
  return numeric == null ? null : Math.round(numeric);
}

function isSupportedLogoFile(file: File) {
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

function fieldValue(proposal: IllustrationTrainingProposal, path: IllustrationFieldPath) {
  const extract = proposal.normalizedExtract;
  if (path.startsWith('projections[].')) {
    const key = path.replace('projections[].', '') as keyof NonNullable<typeof extract.projections>[number];
    const values = (extract.projections || [])
      .map(row => row[key])
      .filter(value => value != null)
      .slice(0, 4);
    return values.length ? values.join(', ') : '-';
  }
  switch (path) {
    case 'carrier': return extract.carrier;
    case 'productName': return extract.productName;
    case 'productType': return extract.productType;
    case 'client.fullName': return extract.client.fullName;
    case 'client.age': return extract.client.age;
    case 'client.gender': return extract.client.gender;
    case 'client.state': return extract.client.state;
    case 'client.riskClass': return extract.client.riskClass;
    case 'policy.faceAmount': return extract.policy.faceAmount;
    case 'policy.monthlyPremium': return extract.policy.monthlyPremium;
    case 'policy.premiumMode': return extract.policy.premiumMode;
    case 'policy.illustratedRate': return extract.policy.illustratedRate;
    case 'policy.payYears': return extract.policy.payYears;
    case 'policy.termLength': return extract.policy.termLength;
    case 'agent.name': return extract.agent?.name;
    case 'agent.phone': return extract.agent?.phone;
    default: return '-';
  }
}

function evidenceForField(proposal: IllustrationTrainingProposal, path: IllustrationFieldPath): IllustrationEvidenceSnippet | null {
  const evidence = proposal.normalizedExtract.evidence || {};
  const direct = evidence[path];
  if (direct) return direct;
  return Object.values(evidence).find(item => item?.fieldPath === path) || null;
}

function fieldConfidence(proposal: IllustrationTrainingProposal, path: IllustrationFieldPath) {
  return proposal.normalizedExtract.fieldConfidence?.[path] ?? evidenceForField(proposal, path)?.confidence ?? null;
}

function proposalToReviewDraft(response: IllustrationTrainingResponse, mode: ReviewMode): ReviewDraft | null {
  if (response.status === 'failed') return null;
  const proposal = response.proposal;
  return {
    mode,
    status: response.status,
    message: response.message,
    proposal,
    exampleId: response.example?.id || proposal.exampleId,
    runId: response.run.id || proposal.runId,
    normalizedExtractJson: jsonText(proposal.normalizedExtract),
    fingerprints: proposal.fingerprints.map(fingerprint => ({
      include: true,
      fingerprintType: fingerprint.fingerprintType,
      matchStrategy: fingerprint.matchStrategy,
      value: fingerprint.value,
      pageHint: fingerprint.pageHint == null ? '' : String(fingerprint.pageHint),
      required: fingerprint.required,
      weight: fingerprint.weight,
      confidence: fingerprint.confidence,
      evidenceSnippet: fingerprint.evidenceSnippet || '',
    })),
    fieldMappings: proposal.fieldMappings.map(mapping => ({
      include: true,
      fieldPath: mapping.fieldPath,
      sourceStrategy: mapping.sourceStrategy,
      sourceSelectorJson: jsonText(mapping.sourceSelector),
      transformRulesJson: jsonText(mapping.transformRules),
      required: mapping.required,
      minConfidence: mapping.minConfidence,
      notes: mapping.notes || '',
    })),
    projectionMappings: proposal.projectionMappings.map(mapping => ({
      include: true,
      projectionKey: mapping.projectionKey,
      sourceStrategy: mapping.sourceStrategy,
      rowSelectorJson: jsonText(mapping.rowSelector),
      columnMappingsJson: jsonText(mapping.columnMappings),
      valueMappingsJson: jsonText(mapping.valueMappings),
      transformRulesJson: jsonText(mapping.transformRules),
      required: mapping.required,
      minConfidence: mapping.minConfidence,
      notes: mapping.notes || '',
    })),
  };
}

function reviewDraftToCorrectionInput(
  detail: IllustrationProfileDetail,
  review: ReviewDraft,
): IllustrationTrainingCorrectionInput {
  const correctedExtract = parseJsonObject(review.normalizedExtractJson, 'Corrected extract');
  const evidenceSnippets = parseJsonObject(
    jsonText(correctedExtract.evidence || review.proposal.normalizedExtract.evidence),
    'Evidence snippets',
  );
  const fingerprints: IllustrationProfileFingerprint[] = review.fingerprints
    .filter(row => row.include)
    .map(row => ({
      fingerprintType: row.fingerprintType,
      matchStrategy: row.matchStrategy,
      value: row.value,
      pageHint: optionalPageHint(row.pageHint),
      required: row.required,
      weight: row.weight,
      confidence: row.confidence,
      evidenceSnippet: row.evidenceSnippet,
    }));
  const fieldMappings: IllustrationProfileFieldMapping[] = review.fieldMappings
    .filter(row => row.include)
    .map(row => {
      const sourceSelector = parseJsonObject(row.sourceSelectorJson, `${row.fieldPath} selector`);
      return {
        fieldPath: row.fieldPath,
        sourceStrategy: row.sourceStrategy,
        sourceSelector: row.sourceStrategy === 'constant' || row.sourceStrategy === 'manual'
          ? sourceSelector
          : stripSelectorLiteralValue(sourceSelector),
        transformRules: parseJsonObject(row.transformRulesJson, `${row.fieldPath} transform rules`),
        required: row.required,
        minConfidence: row.minConfidence,
        notes: row.notes,
      };
    });
  const projectionMappings: IllustrationProfileProjectionMapping[] = review.projectionMappings
    .filter(row => row.include)
    .map(row => {
      const rowSelector = parseJsonObject(row.rowSelectorJson, `${row.projectionKey} row selector`);
      const columnMappings = parseJsonObject(row.columnMappingsJson, `${row.projectionKey} column mappings`);
      const valueMappings = parseJsonObject(row.valueMappingsJson, `${row.projectionKey} value mappings`);
      const shouldStrip = row.sourceStrategy !== 'manual';
      return {
        projectionKey: row.projectionKey,
        sourceStrategy: row.sourceStrategy,
        rowSelector: shouldStrip ? stripSelectorLiteralValue(rowSelector) : rowSelector,
        columnMappings: shouldStrip ? stripSelectorLiteralValue(columnMappings) : columnMappings,
        valueMappings: shouldStrip ? stripSelectorLiteralValue(valueMappings) : valueMappings,
        transformRules: parseJsonObject(row.transformRulesJson, `${row.projectionKey} transform rules`),
        required: row.required,
        minConfidence: row.minConfidence,
        notes: row.notes,
      };
    });
  return {
    profileVersionId: review.proposal.profileVersionId || detail.draftVersion?.id || null,
    status: 'reviewed',
    correctedExtract,
    evidenceSnippets,
    fingerprints,
    fieldMappings,
    projectionMappings,
  };
}

function reviewDraftToAutoFixInput(
  detail: IllustrationProfileDetail,
  review: ReviewDraft,
): IllustrationTrainingAutoFixInput {
  const correctedExtract = parseJsonObject(review.normalizedExtractJson, 'Corrected extract');
  const evidenceSnippets = parseJsonObject(
    jsonText(correctedExtract.evidence || review.proposal.normalizedExtract.evidence),
    'Evidence snippets',
  );
  return {
    profileVersionId: review.proposal.profileVersionId || detail.draftVersion?.id || null,
    correctedExtract,
    evidenceSnippets,
    verificationIssues: review.proposal.verification?.issues || [],
  };
}

function fileSizeLabel(bytes?: number | null) {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortHash(value?: string | null, length = 12) {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function versionRef(profile: IllustrationProfileDetail, profileVersionId?: string | null) {
  if (!profileVersionId) return '-';
  const version = profile.versions.find(item => item.id === profileVersionId);
  return version ? `v${version.versionNumber}` : shortHash(profileVersionId, 8);
}

function objectCount(value?: Record<string, unknown> | null) {
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasSavedReviewProposal(run: IllustrationExtractionRunSummary) {
  return isRecord(run.metadata) && isRecord(run.metadata.reviewProposal);
}

function isVerificationReport(value: unknown): value is IllustrationTrainingVerificationReport {
  return isRecord(value)
    && typeof value.publishable === 'boolean'
    && Array.isArray(value.fieldMappings)
    && Array.isArray(value.requiredFields);
}

function verificationFromRun(run?: IllustrationExtractionRunSummary | null) {
  const metadata = isRecord(run?.metadata) ? run.metadata : {};
  return isVerificationReport(metadata.verification) ? metadata.verification : null;
}

function latestVerificationForVersion(detail: IllustrationProfileDetail, profileVersionId?: string | null) {
  if (!profileVersionId) return null;
  const run = detail.runs.find(item =>
    item.profileVersionId === profileVersionId
    && item.runType === 'admin_train'
    && isVerificationReport(isRecord(item.metadata) ? item.metadata.verification : null)
  );
  return verificationFromRun(run);
}

function latestReviewRun(detail: IllustrationProfileDetail, example: IllustrationTrainingExampleSummary) {
  return detail.runs.find(run =>
    run.trainingExampleId === example.id
    && run.runType === 'admin_train'
    && (run.status === 'succeeded' || run.status === 'needs_review')
    && hasSavedReviewProposal(run)
  ) || null;
}

function savedProposalFromRun(detail: IllustrationProfileDetail, example: IllustrationTrainingExampleSummary, run: IllustrationExtractionRunSummary): IllustrationTrainingProposal | null {
  const metadata = isRecord(run.metadata) ? run.metadata : {};
  const stored = metadata.reviewProposal;
  if (!isRecord(stored)) return null;
  const normalizedExtract = isRecord(run.normalizedExtract) && objectCount(run.normalizedExtract)
    ? run.normalizedExtract
    : stored.normalizedExtract;
  if (!isRecord(normalizedExtract)) return null;
  return {
    profileId: detail.id,
    profileVersionId: run.profileVersionId || example.profileVersionId || detail.draftVersion?.id || undefined,
    exampleId: example.id,
    runId: run.id,
    modelProvider: run.modelProvider || undefined,
    modelName: run.modelName || undefined,
    normalizedExtract: normalizedExtract as IllustrationTrainingProposal['normalizedExtract'],
    fingerprints: Array.isArray(stored.fingerprints) ? stored.fingerprints as IllustrationTrainingProposal['fingerprints'] : [],
    fieldMappings: Array.isArray(stored.fieldMappings) ? stored.fieldMappings as IllustrationTrainingProposal['fieldMappings'] : [],
    projectionMappings: Array.isArray(stored.projectionMappings) ? stored.projectionMappings as IllustrationTrainingProposal['projectionMappings'] : [],
    verification: isVerificationReport(stored.verification)
      ? stored.verification
      : verificationFromRun(run) || undefined,
    confidence: typeof stored.confidence === 'number' ? stored.confidence : run.extractionConfidence ?? 0,
    issues: Array.isArray(stored.issues) ? stored.issues as IllustrationTrainingProposal['issues'] : [],
  };
}

function JsonPreview({ value }: { value: unknown }) {
  return <pre className="inventory-json">{jsonText(value)}</pre>;
}

function VerificationPanel({ verification }: { verification?: IllustrationTrainingVerificationReport | null }) {
  if (!verification) {
    return (
      <section className="verification-panel">
        <h3>Verification</h3>
        <div className="empty">No replay verification is available for this training run.</div>
      </section>
    );
  }
  const requiredRows = verification.fieldMappings.filter(row => verification.requiredFields.includes(row.fieldPath));
  return (
    <section className="verification-panel">
      <div className="panel-head inline-panel-head">
        <div>
          <h3>Verification</h3>
          <p className="muted">{verification.trainingFileName || 'Training PDF'} / {dateTime(verification.verifiedAt)}</p>
        </div>
        <StatusBadge value={verification.publishable ? 'ready' : 'needs_review'} />
      </div>
      {!verification.publishable && (
        <div className="error-box compact">This profile is not ready to publish.</div>
      )}
      <table className="illustration-review-table verification-table">
        <thead>
          <tr>
            <th>Required field</th>
            <th>Status</th>
            <th>Expected</th>
            <th>Replay</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {requiredRows.map((row, index) => (
            <tr key={`${row.fieldPath}:${index}`} className={row.status !== 'passed' ? 'low-confidence-row' : ''}>
              <td><strong>{row.fieldPath}</strong></td>
              <td><StatusBadge value={row.status} /></td>
              <td><code>{compactJson(row.expectedValue)}</code></td>
              <td><code>{compactJson(row.replayValue)}</code></td>
              <td className="text-cell">{row.evidence?.text || row.message || '-'}</td>
            </tr>
          ))}
          {!requiredRows.length && <tr><td colSpan={5}><div className="empty">No required mapping checks found.</div></td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function InventorySection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="inventory-detail-section" open>
      <summary>
        <span>{title}</span>
        <code>{count}</code>
      </summary>
      <div className="inventory-table-wrap">
        {children}
      </div>
    </details>
  );
}

function SavedProfileDetails({
  detail,
  onOpenReview,
  onRequestRetrain,
}: {
  detail: IllustrationProfileDetail;
  onOpenReview: (example: IllustrationTrainingExampleSummary, run: IllustrationExtractionRunSummary) => void;
  onRequestRetrain: (example: IllustrationTrainingExampleSummary) => void;
}) {
  return (
    <section className="illustration-training-panel saved-profile-details">
      <h3>Saved Profile Details</h3>

      <InventorySection title="Versions" count={detail.versions.length}>
        <table className="inventory-detail-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Schema</th>
              <th>Min match</th>
              <th>Min extraction</th>
              <th>Published</th>
              <th>Updated</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {detail.versions.map(version => (
              <tr key={version.id}>
                <td><strong>v{version.versionNumber}</strong></td>
                <td><StatusBadge value={version.status} /></td>
                <td>{version.schemaVersion}</td>
                <td>{formatPercent(version.minMatchScore)}</td>
                <td>{formatPercent(version.minExtractionConfidence)}</td>
                <td>{dateTime(version.publishedAt)}</td>
                <td>{dateTime(version.updatedAt)}</td>
                <td><code>{shortHash(version.id, 10)}</code></td>
              </tr>
            ))}
            {!detail.versions.length && <tr><td colSpan={8}><div className="empty">No versions saved.</div></td></tr>}
          </tbody>
        </table>
      </InventorySection>

      <InventorySection title="Training Examples" count={detail.examples.length}>
        <table className="inventory-detail-table training-examples-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Version</th>
              <th>Status</th>
              <th>Size</th>
              <th>Evidence</th>
              <th>Corrected output</th>
              <th>Updated</th>
              <th>Notes</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {detail.examples.map(example => {
              const reviewRun = latestReviewRun(detail, example);
              return (
                <tr key={example.id}>
                  <td>
                    <strong>{example.fileName}</strong>
                    <br />
                    <code>{shortHash(example.fileSha256)}</code>
                  </td>
                  <td>{versionRef(detail, example.profileVersionId)}</td>
                  <td><StatusBadge value={example.status} /></td>
                  <td>{fileSizeLabel(example.fileSizeBytes)}</td>
                  <td>{objectCount(example.evidenceSnippets as Record<string, unknown> | undefined)} snippets</td>
                  <td><JsonPreview value={example.correctedExtract || {}} /></td>
                  <td>{dateTime(example.updatedAt)}</td>
                  <td className="text-cell">{example.notes || '-'}</td>
                  <td>
                    {reviewRun ? (
                      <ActionButton className="ghost-button compact-action" type="button" icon="eye" onClick={() => onOpenReview(example, reviewRun)}>
                        Open review
                      </ActionButton>
                    ) : example.status === 'needs_review' ? (
                      <ActionButton className="ghost-button compact-action" type="button" icon="sync" onClick={() => onRequestRetrain(example)}>
                        Upload again
                      </ActionButton>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
            {!detail.examples.length && <tr><td colSpan={9}><div className="empty">No training examples saved.</div></td></tr>}
          </tbody>
        </table>
      </InventorySection>

      <InventorySection title="Fingerprints" count={detail.fingerprints.length}>
        <table className="inventory-detail-table fingerprints-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Version</th>
              <th>Strategy</th>
              <th>Value</th>
              <th>Page</th>
              <th>Confidence</th>
              <th>Weight</th>
              <th>Required</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {detail.fingerprints.map((fingerprint, index) => (
              <tr key={fingerprint.id || `${fingerprint.fingerprintType}:${index}`}>
                <td><strong>{fingerprint.fingerprintType}</strong></td>
                <td>{versionRef(detail, fingerprint.profileVersionId)}</td>
                <td>{fingerprint.matchStrategy}</td>
                <td className="text-cell"><code>{fingerprint.value}</code></td>
                <td>{fingerprint.pageHint ?? '-'}</td>
                <td>{formatPercent(fingerprint.confidence)}</td>
                <td>{fingerprint.weight}</td>
                <td><StatusBadge value={fingerprint.required} /></td>
                <td className="text-cell">{fingerprint.evidenceSnippet || '-'}</td>
              </tr>
            ))}
            {!detail.fingerprints.length && <tr><td colSpan={9}><div className="empty">No fingerprints saved.</div></td></tr>}
          </tbody>
        </table>
      </InventorySection>

      <InventorySection title="Field Mappings" count={detail.fieldMappings.length}>
        <table className="inventory-detail-table saved-field-mappings-table">
          <thead>
            <tr>
              <th>MANLE field</th>
              <th>Version</th>
              <th>Strategy</th>
              <th>Selector</th>
              <th>Transform</th>
              <th>Min confidence</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {detail.fieldMappings.map((mapping, index) => (
              <tr key={mapping.id || `${mapping.fieldPath}:${index}`}>
                <td><strong>{mapping.fieldPath}</strong></td>
                <td>{versionRef(detail, mapping.profileVersionId)}</td>
                <td>{mapping.sourceStrategy}</td>
                <td><JsonPreview value={mapping.sourceSelector} /></td>
                <td><JsonPreview value={mapping.transformRules} /></td>
                <td>{formatPercent(mapping.minConfidence)}</td>
                <td><StatusBadge value={mapping.required} /></td>
                <td className="text-cell">{mapping.notes || '-'}</td>
              </tr>
            ))}
            {!detail.fieldMappings.length && <tr><td colSpan={8}><div className="empty">No field mappings saved.</div></td></tr>}
          </tbody>
        </table>
      </InventorySection>

      <InventorySection title="Projection Mappings" count={detail.projectionMappings.length}>
        <table className="inventory-detail-table saved-projection-mappings-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Version</th>
              <th>Strategy</th>
              <th>Row selector</th>
              <th>Columns</th>
              <th>Values</th>
              <th>Transform</th>
              <th>Min confidence</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {detail.projectionMappings.map((mapping, index) => (
              <tr key={mapping.id || `${mapping.projectionKey}:${index}`}>
                <td><strong>{mapping.projectionKey}</strong></td>
                <td>{versionRef(detail, mapping.profileVersionId)}</td>
                <td>{mapping.sourceStrategy}</td>
                <td><JsonPreview value={mapping.rowSelector} /></td>
                <td><JsonPreview value={mapping.columnMappings} /></td>
                <td><JsonPreview value={mapping.valueMappings} /></td>
                <td><JsonPreview value={mapping.transformRules} /></td>
                <td>{formatPercent(mapping.minConfidence)}</td>
                <td><StatusBadge value={mapping.required} /></td>
                <td className="text-cell">{mapping.notes || '-'}</td>
              </tr>
            ))}
            {!detail.projectionMappings.length && <tr><td colSpan={10}><div className="empty">No projection mappings saved.</div></td></tr>}
          </tbody>
        </table>
      </InventorySection>
    </section>
  );
}

export default function IllustrationProfilesView({ data, reload }: { data: AdminData; reload: LoadAll }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<IllustrationProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [profileUpsert, setProfileUpsert] = useState<IllustrationProfilePdfUpsertResponse | null>(null);
  const [search, setSearch] = useState('');
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [submitting, setSubmitting] = useState<SubmitAction>(null);
  const confirmDialog = useConfirmDialog();
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<IllustrationProfileSortKey> | null>(null);
  const profiles = useMemo(
    () => sortedRows(data.illustrationProfiles, sort, illustrationProfileSortAccessors),
    [data.illustrationProfiles, sort],
  );
  const draftVerification = detail ? latestVerificationForVersion(detail, detail.draftVersion?.id) : null;
  const publishReady = Boolean(
    detail?.draftVersion
    && detail.fingerprints.length
    && detail.fieldMappings.length
    && draftVerification?.publishable
    && !reviewDirty,
  );

  function sortBy(column: IllustrationProfileSortKey) {
    setSort(current => nextSortState(current, column));
  }

  function markReviewDirty() {
    if (review?.mode === 'train') setReviewDirty(true);
  }

  async function refreshDetail(profileId: string) {
    const result = await api.illustrationProfile(profileId);
    setDetail(result.profile);
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = field(event.currentTarget, 'search');
    setSearch(nextSearch);
    await reload('', '', nextSearch);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = event.currentTarget;
    try {
      const result = await api.createIllustrationProfile({
        carrier: field(form, 'carrier'),
        productName: field(form, 'productName'),
        productType: field(form, 'productType') as IllustrationProductType,
        notes: field(form, 'notes'),
      });
      setCreateOpen(false);
      setDetail(result.profile);
      setReview(null);
      setReviewDirty(false);
      setSearch('');
      setMessage('Illustration profile created.');
      await reload('', '', '');
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  async function upsertProfileFromPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting('upsertProfile');
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    if (!(file instanceof File) || !file.name) {
      setError('A PDF file is required.');
      setSubmitting(null);
      return;
    }
    const productType = field(form, 'productType');
    try {
      const result = await api.upsertIllustrationProfileFromPdf({
        file,
        notes: field(form, 'notes'),
        maxPages: optionalNumber(field(form, 'maxPages')),
        productType: productType === 'iul' || productType === 'term' ? productType : undefined,
      });
      setDetail(result.profile);
      setProfileUpsert(result);
      setReview(null);
      setReviewDirty(false);
      setMessage(`${result.created ? 'Created' : 'Opened existing'} profile: ${result.identity.carrier} / ${result.identity.productName}.`);
      await reload('', '', search);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function openProfile(profile: IllustrationProfileSummary) {
    setError('');
    setMessage('');
    setDetail(null);
    setReview(null);
    setReviewDirty(false);
    setDetailLoading(true);
    try {
      const result = await api.illustrationProfile(profile.id);
      setDetail(result.profile);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setDetailLoading(false);
    }
  }

  async function runTrainingUpload(event: FormEvent<HTMLFormElement>, mode: ReviewMode) {
    event.preventDefault();
    if (!detail) return;
    setError('');
    setMessage('');
    setSubmitting(mode);
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    if (!(file instanceof File) || !file.name) {
      setError('A PDF file is required.');
      setSubmitting(null);
      return;
    }
    try {
      const body = {
        file,
        profileVersionId: detail.draftVersion?.id,
        notes: field(form, 'notes'),
        useFastModel: boolField(form, 'useFastModel'),
        maxPages: optionalNumber(field(form, 'maxPages')),
      };
      const response = mode === 'train'
        ? await api.trainIllustrationProfile(detail.id, body)
        : await api.testIllustrationProfile(detail.id, body);
      if (response.status === 'failed') {
        setReview(null);
        setReviewDirty(false);
        setError(`${response.code}: ${response.message}`);
        return;
      }
      const draft = proposalToReviewDraft(response, mode);
      setReview(draft);
      setReviewDirty(mode === 'train');
      setMessage(mode === 'train' ? 'Training proposal ready for review.' : 'Test extraction completed.');
      form.reset();
      await refreshDetail(detail.id);
      await reload('', '', search);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  function openSavedReview(example: IllustrationTrainingExampleSummary, run: IllustrationExtractionRunSummary) {
    if (!detail) return;
    setError('');
    setMessage('');
    const proposal = savedProposalFromRun(detail, example, run);
    if (!proposal) {
      setError('This training example needs review, but its saved proposal is not available. Run Train sample again to regenerate the review.');
      return;
    }
    const draft = proposalToReviewDraft({
      status: run.status === 'needs_review' ? 'needs_review' : 'succeeded',
      proposal,
      example,
      run,
    }, 'train');
    setReview(draft);
    setReviewDirty(true);
    setMessage('Loaded saved training proposal for review.');
    window.setTimeout(() => {
      document.querySelector('.illustration-review-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  }

  function requestRetrainReview(example: IllustrationTrainingExampleSummary) {
    setError('');
    setMessage(`Select ${example.fileName} again under Training PDF, then click Train sample to regenerate the review.`);
    document.getElementById('illustration-training-upload')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function updateFingerprint(index: number, patch: Partial<FingerprintDraft>) {
    setReview(current => current ? {
      ...current,
      fingerprints: current.fingerprints.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    } : current);
    markReviewDirty();
  }

  function updateFieldMapping(index: number, patch: Partial<FieldMappingDraft>) {
    setReview(current => current ? {
      ...current,
      fieldMappings: current.fieldMappings.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    } : current);
    markReviewDirty();
  }

  function updateProjectionMapping(index: number, patch: Partial<ProjectionMappingDraft>) {
    setReview(current => current ? {
      ...current,
      projectionMappings: current.projectionMappings.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    } : current);
    markReviewDirty();
  }

  function updateExtractJson(value: string) {
    setReview(current => current ? { ...current, normalizedExtractJson: value } : current);
    markReviewDirty();
  }

  async function saveReview() {
    if (!detail || !review) return;
    if (!review.exampleId) {
      setError('Only training runs can be approved. Use Train sample before saving reviewed mappings.');
      return;
    }
    setError('');
    setMessage('');
    setSubmitting('saveReview');
    try {
      const result = await api.correctIllustrationTrainingExample(
        detail.id,
        review.exampleId,
        reviewDraftToCorrectionInput(detail, review),
      );
      setDetail(result.profile);
      if (result.verification) {
        setReview(current => current ? {
          ...current,
          status: result.verification?.publishable ? 'succeeded' : 'needs_review',
          proposal: {
            ...current.proposal,
            verification: result.verification || undefined,
          },
        } : current);
      }
      setReviewDirty(false);
      setMessage(result.verification && !result.verification.publishable
        ? 'Reviewed mappings saved, but required mappings still need replay fixes before publishing.'
        : 'Reviewed mappings saved to the draft profile version.');
      await reload('', '', search);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function autoFixFailedFields() {
    if (!detail || !review?.exampleId) return;
    setError('');
    setMessage('');
    setSubmitting('autoFix');
    try {
      const result = await api.autoFixIllustrationTrainingMappings(
        detail.id,
        review.exampleId,
        reviewDraftToAutoFixInput(detail, review),
      );
      const draft = proposalToReviewDraft(result, 'train');
      if (result.status === 'failed' || !draft) {
        setError(result.status === 'failed' ? result.message : 'Could not generate auto-fix mappings.');
        return;
      }
      setReview(draft);
      setReviewDirty(true);
      setMessage(result.proposal.verification?.publishable
        ? 'Auto-fix proposal is ready to review and save.'
        : 'Auto-fix proposal generated, but required mappings still need review.');
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function publishProfile() {
    if (!detail) return;
    if (review?.mode === 'train' && reviewDirty) {
      setError('Save the reviewed training mappings before publishing.');
      return;
    }
    if (!(await confirmDialog({
      title: 'Publish illustration profile?',
      message: `${detail.carrier} ${detail.productName} mappings will become available to generator runtime once runtime integration is added.`,
      confirmLabel: 'Publish profile',
      variant: 'warning',
    }))) return;
    setError('');
    setMessage('');
    setSubmitting('publish');
    try {
      const result = await api.publishIllustrationProfile(detail.id, { profileVersionId: detail.draftVersion?.id });
      setDetail(result.profile);
      setReview(null);
      setReviewDirty(false);
      setMessage('Illustration profile published.');
      await reload('', '', search);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function deleteProfile() {
    if (!detail) return;
    if (!(await confirmDialog({
      title: 'Delete illustration profile?',
      message: 'This will permanently delete this illustration profile, including all versions, fingerprints, field mappings, projection mappings, training examples, extraction runs, and carrier logo assets linked to this profile. This action cannot be undone.',
      confirmLabel: 'Delete profile',
      cancelLabel: 'Cancel',
      variant: 'danger',
    }))) return;
    setError('');
    setMessage('');
    setSubmitting('deleteProfile');
    try {
      await api.deleteIllustrationProfile(detail.id);
      setDetail(null);
      setReview(null);
      setReviewDirty(false);
      setDetailLoading(false);
      setMessage('Illustration profile deleted.');
      await reload('', '', search);
    } catch {
      setError('Could not delete illustration profile.');
    } finally {
      setSubmitting(null);
    }
  }

  async function uploadCarrierLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    if (!(file instanceof File) || !file.name) {
      setError('A carrier logo image is required.');
      return;
    }
    if (!isSupportedLogoFile(file)) {
      setError('Carrier logo must be PNG, JPEG, or WebP.');
      return;
    }
    setSubmitting('logo');
    try {
      const result = await api.uploadIllustrationCarrierLogo(detail.id, file);
      setDetail(result.profile);
      setMessage('Carrier logo saved.');
      form.reset();
      await reload('', '', search);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function clearCarrierLogo() {
    if (!detail) return;
    if (!(await confirmDialog({
      title: 'Clear carrier logo?',
      message: `Clear the approved logo for ${detail.carrier}?`,
      confirmLabel: 'Clear logo',
      variant: 'danger',
    }))) return;
    setError('');
    setMessage('');
    setSubmitting('logo');
    try {
      const result = await api.clearIllustrationCarrierLogo(detail.id);
      setDetail(result.profile);
      setMessage('Carrier logo cleared.');
      await reload('', '', search);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(null);
    }
  }

  function closeDetail() {
    setDetail(null);
    setReview(null);
    setReviewDirty(false);
    setDetailLoading(false);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Illustration Profiles</h2>
        <div className="toolbar-row">
          <form className="inline-form" onSubmit={runSearch}>
            <input name="search" placeholder="Search carrier or product" defaultValue={search} />
            <ActionButton type="submit" icon="search">Search</ActionButton>
          </form>
          <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Manual profile</ActionButton>
        </div>
      </div>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}

      <section className="profile-upsert-panel">
        <div className="panel-head inline-panel-head">
          <div>
            <h3>Upload PDF Profile</h3>
            {profileUpsert && (
              <p className="muted">
                {profileUpsert.file.fileName} / confidence {formatPercent(profileUpsert.identity.confidence)}
              </p>
            )}
          </div>
          {profileUpsert && <StatusBadge value={profileUpsert.created ? 'created' : 'existing'} />}
        </div>
        <form className="profile-upsert-form" onSubmit={upsertProfileFromPdf}>
          <label>PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
          <label>Product type<CustomSelect name="productType" defaultValue="" placeholder="Auto detect" options={productTypeDetectionOptions} /></label>
          <label>Max pages<input name="maxPages" type="number" min={1} placeholder="All pages" /></label>
          <label>Notes<input name="notes" placeholder="Internal notes for profile creation" /></label>
          <ActionButton type="submit" icon="sync" disabled={submitting != null}>
            {submitting === 'upsertProfile' ? 'Extracting...' : 'Extract + upsert'}
          </ActionButton>
        </form>
        {profileUpsert && (
          <div className="identity-result-grid">
            <div>
              <span>Carrier</span>
              <strong>{profileUpsert.identity.carrier}</strong>
              <small>{profileUpsert.identity.evidence.carrier ? `Page ${profileUpsert.identity.evidence.carrier.page}` : 'Manual'}</small>
            </div>
            <div>
              <span>Product</span>
              <strong>{profileUpsert.identity.productName}</strong>
              <small>{profileUpsert.identity.evidence.productName ? `Page ${profileUpsert.identity.evidence.productName.page}` : 'Manual'}</small>
            </div>
            <div>
              <span>Type</span>
              <strong>{productTypeLabel(profileUpsert.identity.productType)}</strong>
              <small>{profileUpsert.file.extractedPageCount} / {profileUpsert.file.pageCount} pages</small>
            </div>
          </div>
        )}
      </section>

      <table>
        <thead>
          <tr>
            <SortableTh label="Carrier" column="carrier" sort={sort} onSort={sortBy} />
            <SortableTh label="Product" column="product" sort={sort} onSort={sortBy} />
            <SortableTh label="Type" column="productType" sort={sort} onSort={sortBy} />
            <SortableTh label="Status" column="status" sort={sort} onSort={sortBy} />
            <SortableTh label="Active Version" column="activeVersion" sort={sort} onSort={sortBy} />
            <SortableTh label="Updated" column="updatedAt" sort={sort} onSort={sortBy} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(profile => (
            <tr key={profile.id}>
              <td><strong>{profile.carrier}</strong></td>
              <td>{profile.productName}<br /><span className="muted">{profile.notes || 'No notes'}</span></td>
              <td>{productTypeLabel(profile.productType)}</td>
              <td><StatusBadge value={profile.status} /></td>
              <td>{activeVersionLabel(profile)}</td>
              <td>{dateTime(profile.updatedAt)}</td>
              <td className="button-cell">
                <ActionButton type="button" icon="eye" onClick={() => openProfile(profile)}>Open</ActionButton>
              </td>
            </tr>
          ))}
          {!profiles.length && (
            <tr>
              <td colSpan={7}><div className="empty">No illustration profiles found.</div></td>
            </tr>
          )}
        </tbody>
      </table>

      {createOpen && (
        <Dialog title="Create illustration profile" onClose={() => setCreateOpen(false)}>
          <form className="dialog-form" onSubmit={create}>
            <label>Carrier<input name="carrier" placeholder="Transamerica" required /></label>
            <label>Product name<input name="productName" placeholder="Financial Foundation IUL" required /></label>
            <label>Product type<CustomSelect name="productType" defaultValue="iul" options={illustrationProductTypeOptions} /></label>
            <label>Notes<textarea name="notes" placeholder="Internal notes for admin training" /></label>
            <div className="dialog-actions">
              <ActionButton className="ghost-button" type="button" icon="x" onClick={() => setCreateOpen(false)}>Cancel</ActionButton>
              <ActionButton type="submit" icon="plus">Create profile</ActionButton>
            </div>
          </form>
        </Dialog>
      )}

      {(detailLoading || detail) && (
        <Dialog title="Illustration profile details" onClose={closeDetail} panelClassName="wide-dialog">
          {detailLoading && (
            <div className="dialog-form">
              <div className="loading">Loading profile...</div>
            </div>
          )}
          {!detailLoading && detail && (
            <div className="dialog-form illustration-workbench">
              <div className="dialog-context">
                <strong>{detail.carrier} / {detail.productName}</strong>
                <span>{productTypeLabel(detail.productType)} / {detail.status}</span>
                <code>{detail.id}</code>
                <span>{versionLine(detail)}</span>
              </div>
              <div className="illustration-detail-grid">
                <dl className="profile-facts">
                  <div><dt>Status</dt><dd><StatusBadge value={detail.status} /></dd></div>
                  <div><dt>Active</dt><dd>{activeVersionLabel(detail)}</dd></div>
                  <div><dt>Created</dt><dd>{dateTime(detail.createdAt)}</dd></div>
                  <div><dt>Updated</dt><dd>{dateTime(detail.updatedAt)}</dd></div>
                  <div><dt>Notes</dt><dd>{detail.notes || 'No notes'}</dd></div>
                </dl>
                <div className="entitlement-list">
                  <strong>Profile inventory</strong>
                  <div><span>Versions</span><code>{detail.versions.length}</code></div>
                  <div><span>Training examples</span><code>{detail.examples.length}</code></div>
                  <div><span>Fingerprints</span><code>{detail.fingerprints.length}</code></div>
                  <div><span>Field mappings</span><code>{detail.fieldMappings.length}</code></div>
                  <div><span>Projection mappings</span><code>{detail.projectionMappings.length}</code></div>
                </div>
                <div className="carrier-logo-panel">
                  <div className="carrier-logo-head">
                    <strong>Carrier logo</strong>
                    {detail.carrierLogoUrl ? <StatusBadge value="saved" /> : <StatusBadge value="missing" />}
                  </div>
                  <div className="carrier-logo-preview">
                    {detail.carrierLogoUrl ? (
                      <img src={detail.carrierLogoUrl} alt={`${detail.carrier} logo`} />
                    ) : (
                      <span>No carrier logo saved.</span>
                    )}
                  </div>
                  <form className="carrier-logo-form" onSubmit={uploadCarrierLogo}>
                    <input name="file" type="file" accept="image/png,image/jpeg,image/webp" />
                    <ActionButton type="submit" icon="save" disabled={submitting != null}>
                      {submitting === 'logo' ? 'Saving...' : 'Upload logo'}
                    </ActionButton>
                    <ActionButton className="ghost-button" type="button" icon="x" onClick={clearCarrierLogo} disabled={!detail.carrierLogoUrl || submitting != null}>
                      Clear
                    </ActionButton>
                  </form>
                  {detail.carrierLogoFileName && (
                    <small>{detail.carrierLogoFileName} / {fileSizeLabel(detail.carrierLogoFileSizeBytes)}</small>
                  )}
                </div>
              </div>

              <SavedProfileDetails detail={detail} onOpenReview={openSavedReview} onRequestRetrain={requestRetrainReview} />

              <section className="illustration-training-panel" id="illustration-training-upload">
                <h3>Training and Testing</h3>
                <div className="illustration-upload-grid">
                  <form className="stack-form" onSubmit={(event) => runTrainingUpload(event, 'train')}>
                    <label>Training PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
                    <label>Notes<input name="notes" placeholder="Sample source, carrier form, or case notes" /></label>
                    <label>Max pages<input name="maxPages" type="number" min={1} placeholder="All pages" /></label>
                    <label className="check"><input name="useFastModel" type="checkbox" defaultChecked /> Use fast model</label>
                    <ActionButton type="submit" icon="sync" disabled={submitting != null}>
                      {submitting === 'train' ? 'Training...' : 'Train sample'}
                    </ActionButton>
                  </form>
                  <form className="stack-form" onSubmit={(event) => runTrainingUpload(event, 'test')}>
                    <label>Test PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
                    <label>Notes<input name="notes" placeholder="Validation sample notes" /></label>
                    <label>Max pages<input name="maxPages" type="number" min={1} placeholder="All pages" /></label>
                    <label className="check"><input name="useFastModel" type="checkbox" defaultChecked /> Use fast model</label>
                    <ActionButton type="submit" icon="eye" disabled={submitting != null}>
                      {submitting === 'test' ? 'Testing...' : 'Test sample'}
                    </ActionButton>
                  </form>
                </div>
              </section>

              {review && (
                <section className="illustration-review-panel">
                  <div className="panel-head inline-panel-head">
                    <div>
                      <h3>{review.mode === 'train' ? 'Training Review' : 'Test Result'}</h3>
                      <p className="muted">
                        Confidence {formatPercent(review.proposal.confidence)}
                        {review.runId ? ` / run ${review.runId}` : ''}
                      </p>
                    </div>
                    <StatusBadge value={review.status} />
                  </div>
                  {review.message && <div className="success-box compact">{review.message}</div>}
                  {review.proposal.issues.length > 0 && (
                    <div className="error-box compact">
                      {review.proposal.issues.map(issue => (
                        <div key={`${issue.path}:${issue.code}`}>{issue.path}: {issue.message}</div>
                      ))}
                    </div>
                  )}

                  <VerificationPanel verification={review.proposal.verification} />

                  <label className="field-label">Corrected sample output JSON</label>
                  <textarea
                    className="json-area"
                    value={review.normalizedExtractJson}
                    onChange={(event) => updateExtractJson(event.currentTarget.value)}
                  />

                  <h3>Fingerprints</h3>
                  <table className="illustration-review-table fingerprint-table">
                    <thead>
                      <tr>
                        <th>Use</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Evidence</th>
                        <th>Confidence</th>
                        <th>Required</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.fingerprints.map((row, index) => (
                        <tr key={`${row.fingerprintType}:${index}`} className={!row.include ? 'is-muted-row' : row.confidence < 0.8 ? 'low-confidence-row' : ''}>
                          <td><input type="checkbox" checked={row.include} onChange={(event) => updateFingerprint(index, { include: event.currentTarget.checked })} /></td>
                          <td>
                            <select value={row.fingerprintType} onChange={(event) => updateFingerprint(index, { fingerprintType: event.currentTarget.value as FingerprintType })}>
                              {fingerprintTypeOptions.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                            <select value={row.matchStrategy} onChange={(event) => updateFingerprint(index, { matchStrategy: event.currentTarget.value as FingerprintStrategy })}>
                              {fingerprintStrategyOptions.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </td>
                          <td><textarea value={row.value} onChange={(event) => updateFingerprint(index, { value: event.currentTarget.value })} /></td>
                          <td><textarea value={row.evidenceSnippet} onChange={(event) => updateFingerprint(index, { evidenceSnippet: event.currentTarget.value })} /></td>
                          <td>
                            <input type="number" min={0} max={1} step={0.01} value={row.confidence} onChange={(event) => updateFingerprint(index, { confidence: Number(event.currentTarget.value) })} />
                            <input type="number" min={0} step={1} value={row.weight} onChange={(event) => updateFingerprint(index, { weight: Number(event.currentTarget.value) })} />
                            <input type="number" min={1} step={1} placeholder="Page" value={row.pageHint} onChange={(event) => updateFingerprint(index, { pageHint: event.currentTarget.value })} />
                          </td>
                          <td><input type="checkbox" checked={row.required} onChange={(event) => updateFingerprint(index, { required: event.currentTarget.checked })} /></td>
                          <td><ActionButton type="button" icon={row.include ? 'x' : 'check'} onClick={() => updateFingerprint(index, { include: !row.include })}>{row.include ? 'Ignore' : 'Restore'}</ActionButton></td>
                        </tr>
                      ))}
                      {!review.fingerprints.length && <tr><td colSpan={7}><div className="empty">No fingerprints proposed.</div></td></tr>}
                    </tbody>
                  </table>

                  <h3>Field Mappings</h3>
                  <table className="illustration-review-table mapping-table">
                    <thead>
                      <tr>
                        <th>MANLE Field</th>
                        <th>Detected Value</th>
                        <th>Evidence</th>
                        <th>Confidence</th>
                        <th>Strategy</th>
                        <th>Transform</th>
                        <th>Required</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.fieldMappings.map((row, index) => {
                        const evidence = evidenceForField(review.proposal, row.fieldPath);
                        const confidence = fieldConfidence(review.proposal, row.fieldPath);
                        return (
                          <tr key={`${row.fieldPath}:${index}`} className={!row.include ? 'is-muted-row' : confidence != null && confidence < row.minConfidence ? 'low-confidence-row' : ''}>
                            <td>
                              <select value={row.fieldPath} onChange={(event) => updateFieldMapping(index, { fieldPath: event.currentTarget.value as IllustrationFieldPath })}>
                                {fieldPathOptions.map(option => <option key={option} value={option}>{option}</option>)}
                              </select>
                              <input value={row.notes} placeholder="Notes" onChange={(event) => updateFieldMapping(index, { notes: event.currentTarget.value })} />
                            </td>
                            <td><code>{compactJson(fieldValue(review.proposal, row.fieldPath))}</code></td>
                            <td className="evidence-cell">
                              {evidence ? (
                                <>
                                  <strong>Page {evidence.page}</strong>
                                  <span>{evidence.text}</span>
                                </>
                              ) : <span className="muted">No evidence</span>}
                            </td>
                            <td>
                              <strong>{formatPercent(confidence)}</strong>
                              <label>Min<input type="number" min={0} max={1} step={0.01} value={row.minConfidence} onChange={(event) => updateFieldMapping(index, { minConfidence: Number(event.currentTarget.value) })} /></label>
                            </td>
                            <td>
                              <select value={row.sourceStrategy} onChange={(event) => updateFieldMapping(index, { sourceStrategy: event.currentTarget.value as FieldSourceStrategy })}>
                                {fieldSourceStrategyOptions.map(option => <option key={option} value={option}>{option}</option>)}
                              </select>
                              <textarea value={row.sourceSelectorJson} onChange={(event) => updateFieldMapping(index, { sourceSelectorJson: event.currentTarget.value })} />
                            </td>
                            <td><textarea value={row.transformRulesJson} onChange={(event) => updateFieldMapping(index, { transformRulesJson: event.currentTarget.value })} /></td>
                            <td><input type="checkbox" checked={row.required} onChange={(event) => updateFieldMapping(index, { required: event.currentTarget.checked })} /></td>
                            <td><ActionButton type="button" icon={row.include ? 'x' : 'check'} onClick={() => updateFieldMapping(index, { include: !row.include })}>{row.include ? 'Ignore' : 'Restore'}</ActionButton></td>
                          </tr>
                        );
                      })}
                      {!review.fieldMappings.length && <tr><td colSpan={8}><div className="empty">No field mappings proposed.</div></td></tr>}
                    </tbody>
                  </table>

                  <h3>Projection Mappings</h3>
                  <table className="illustration-review-table projection-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Strategy</th>
                        <th>Row Selector</th>
                        <th>Columns</th>
                        <th>Values</th>
                        <th>Transform</th>
                        <th>Required</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.projectionMappings.map((row, index) => (
                        <tr key={`${row.projectionKey}:${index}`} className={!row.include ? 'is-muted-row' : ''}>
                          <td>
                            <input value={row.projectionKey} onChange={(event) => updateProjectionMapping(index, { projectionKey: event.currentTarget.value })} />
                            <input type="number" min={0} max={1} step={0.01} value={row.minConfidence} onChange={(event) => updateProjectionMapping(index, { minConfidence: Number(event.currentTarget.value) })} />
                          </td>
                          <td>
                            <select value={row.sourceStrategy} onChange={(event) => updateProjectionMapping(index, { sourceStrategy: event.currentTarget.value as ProjectionSourceStrategy })}>
                              {projectionSourceStrategyOptions.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                            <input value={row.notes} placeholder="Notes" onChange={(event) => updateProjectionMapping(index, { notes: event.currentTarget.value })} />
                          </td>
                          <td><textarea value={row.rowSelectorJson} onChange={(event) => updateProjectionMapping(index, { rowSelectorJson: event.currentTarget.value })} /></td>
                          <td><textarea value={row.columnMappingsJson} onChange={(event) => updateProjectionMapping(index, { columnMappingsJson: event.currentTarget.value })} /></td>
                          <td><textarea value={row.valueMappingsJson} onChange={(event) => updateProjectionMapping(index, { valueMappingsJson: event.currentTarget.value })} /></td>
                          <td><textarea value={row.transformRulesJson} onChange={(event) => updateProjectionMapping(index, { transformRulesJson: event.currentTarget.value })} /></td>
                          <td><input type="checkbox" checked={row.required} onChange={(event) => updateProjectionMapping(index, { required: event.currentTarget.checked })} /></td>
                          <td><ActionButton type="button" icon={row.include ? 'x' : 'check'} onClick={() => updateProjectionMapping(index, { include: !row.include })}>{row.include ? 'Ignore' : 'Restore'}</ActionButton></td>
                        </tr>
                      ))}
                      {!review.projectionMappings.length && <tr><td colSpan={8}><div className="empty">No projection mappings proposed.</div></td></tr>}
                    </tbody>
                  </table>

                  <div className="dialog-actions">
                    <ActionButton className="ghost-button" type="button" icon="x" onClick={() => { setReview(null); setReviewDirty(false); }}>Clear review</ActionButton>
                    <ActionButton
                      className="ghost-button"
                      type="button"
                      icon="sync"
                      onClick={autoFixFailedFields}
                      disabled={!review.exampleId || review.proposal.verification?.publishable === true || submitting != null}
                    >
                      {submitting === 'autoFix' ? 'Auto-fixing...' : 'Auto-fix failed fields with AI'}
                    </ActionButton>
                    <ActionButton type="button" icon="save" onClick={saveReview} disabled={review.mode !== 'train' || submitting != null}>
                      {submitting === 'saveReview' ? 'Saving...' : 'Save reviewed mappings'}
                    </ActionButton>
                  </div>
                </section>
              )}

              <section className="illustration-training-panel">
                <h3>Publish</h3>
                {!publishReady && (
                  <div className="empty">
                    Save reviewed fingerprints and replay-verified required mappings to the draft version before publishing.
                  </div>
                )}
                {draftVerification && !draftVerification.publishable && (
                  <VerificationPanel verification={draftVerification} />
                )}
                <div className="dialog-actions">
                  <ActionButton className="ghost-button" type="button" icon="refresh" onClick={() => refreshDetail(detail.id)} disabled={submitting != null}>Refresh detail</ActionButton>
                  <ActionButton className="danger-button" type="button" icon="trash" onClick={deleteProfile} disabled={submitting != null}>
                    {submitting === 'deleteProfile' ? 'Deleting...' : 'Delete profile'}
                  </ActionButton>
                  <ActionButton type="button" icon="check" onClick={publishProfile} disabled={!publishReady || submitting != null}>
                    {submitting === 'publish' ? 'Publishing...' : 'Publish profile'}
                  </ActionButton>
                  <ActionButton className="ghost-button" type="button" icon="x" onClick={closeDetail}>Close</ActionButton>
                </div>
              </section>
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}
