import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type {
  IllustrationEvidenceSnippet,
  IllustrationFieldPath,
  IllustrationProductType,
  IllustrationProfileDetail,
  IllustrationProfileFieldMapping,
  IllustrationProfileFingerprint,
  IllustrationProfileProjectionMapping,
  IllustrationProfileSummary,
  IllustrationTrainingProposal,
  IllustrationTrainingResponse,
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
  useFeedbackState,
} from '../adminShared';
import type { SortState, SortValue } from '../adminShared';
import { illustrationProductTypeOptions } from './options';

type LoadAll = (customerSearch?: string, systemUserSearch?: string, illustrationProfileSearch?: string) => Promise<void>;
type IllustrationProfileSortKey = 'carrier' | 'product' | 'productType' | 'status' | 'activeVersion' | 'updatedAt';
type ReviewMode = 'train' | 'test';
type SubmitAction = ReviewMode | 'saveReview' | 'publish' | null;
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

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionalPageHint(value: string) {
  const numeric = optionalNumber(value);
  return numeric == null ? null : Math.round(numeric);
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

export default function IllustrationProfilesView({ data, reload }: { data: AdminData; reload: LoadAll }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<IllustrationProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [submitting, setSubmitting] = useState<SubmitAction>(null);
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [sort, setSort] = useState<SortState<IllustrationProfileSortKey> | null>(null);
  const profiles = useMemo(
    () => sortedRows(data.illustrationProfiles, sort, illustrationProfileSortAccessors),
    [data.illustrationProfiles, sort],
  );
  const publishReady = Boolean(detail?.draftVersion && detail.fingerprints.length && detail.fieldMappings.length && !reviewDirty);

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
      const correctedExtract = parseJsonObject(review.normalizedExtractJson, 'Corrected extract');
      const evidenceSnippets = parseJsonObject(jsonText(correctedExtract.evidence || review.proposal.normalizedExtract.evidence), 'Evidence snippets');
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
        .map(row => ({
          fieldPath: row.fieldPath,
          sourceStrategy: row.sourceStrategy,
          sourceSelector: parseJsonObject(row.sourceSelectorJson, `${row.fieldPath} selector`),
          transformRules: parseJsonObject(row.transformRulesJson, `${row.fieldPath} transform rules`),
          required: row.required,
          minConfidence: row.minConfidence,
          notes: row.notes,
        }));
      const projectionMappings: IllustrationProfileProjectionMapping[] = review.projectionMappings
        .filter(row => row.include)
        .map(row => ({
          projectionKey: row.projectionKey,
          sourceStrategy: row.sourceStrategy,
          rowSelector: parseJsonObject(row.rowSelectorJson, `${row.projectionKey} row selector`),
          columnMappings: parseJsonObject(row.columnMappingsJson, `${row.projectionKey} column mappings`),
          valueMappings: parseJsonObject(row.valueMappingsJson, `${row.projectionKey} value mappings`),
          transformRules: parseJsonObject(row.transformRulesJson, `${row.projectionKey} transform rules`),
          required: row.required,
          minConfidence: row.minConfidence,
          notes: row.notes,
        }));
      const result = await api.correctIllustrationTrainingExample(detail.id, review.exampleId, {
        profileVersionId: review.proposal.profileVersionId || detail.draftVersion?.id || null,
        status: 'reviewed',
        correctedExtract,
        evidenceSnippets,
        fingerprints,
        fieldMappings,
        projectionMappings,
      });
      setDetail(result.profile);
      setReviewDirty(false);
      setMessage('Reviewed mappings saved to the draft profile version.');
      await reload('', '', search);
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
    if (!window.confirm(`Publish ${detail.carrier} ${detail.productName}? Published mappings become available to generator runtime once runtime integration is added.`)) return;
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
          <ActionButton type="button" icon="plus" onClick={() => setCreateOpen(true)}>Create profile</ActionButton>
        </div>
      </div>
      {message && <div className="success-box compact">{message}</div>}
      {error && <div className="error-box compact">{error}</div>}
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
              </div>

              <section className="illustration-training-panel">
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
                    Save reviewed fingerprints and field mappings to the draft version before publishing.
                  </div>
                )}
                <div className="dialog-actions">
                  <ActionButton className="ghost-button" type="button" icon="refresh" onClick={() => refreshDetail(detail.id)} disabled={submitting != null}>Refresh detail</ActionButton>
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
