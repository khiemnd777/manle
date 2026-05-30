import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';
import {
  ILLUSTRATION_CONTRACT_SCHEMA_VERSION,
  extractionRunStatusForRuntimeStatus,
  isConfidence,
  isIllustrationProductType,
  requiredIllustrationFieldPaths,
  validateIllustrationExtract,
  type CreateIllustrationProfileInput,
  type IllustrationExtractionRunStatus,
  type IllustrationExtractionRunSummary,
  type IllustrationExtractionRunType,
  type IllustrationProfileDetail,
  type IllustrationProfileFieldMapping,
  type IllustrationProfileFingerprint,
  type IllustrationProfileProjectionMapping,
  type IllustrationProfileStatus,
  type IllustrationProfileSummary,
  type IllustrationProfileVersionStatus,
  type IllustrationProfileVersionSummary,
  type IllustrationProductType,
  type IllustrationRuntimeExtractStatus,
  type IllustrationTrainingCorrectionInput,
  type IllustrationTrainingExampleStatus,
  type IllustrationTrainingExampleSummary,
  type JsonObject,
  type StoreIllustrationExtractionRunInput,
  type StoreIllustrationTrainingExampleInput,
  type UpdateIllustrationExtractionRunInput,
  type UpdateIllustrationProfileInput,
  type UpdateIllustrationTrainingExampleInput,
} from '../types/illustration';
import { audit } from './admin';

type ProfileRow = {
  id: string;
  carrier: string;
  productName: string;
  productType: IllustrationProductType;
  status: IllustrationProfileStatus;
  notes: string;
  activeVersionId?: string | null;
  activeVersionNumber?: number | string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type VersionRow = {
  id: string;
  profileId: string;
  versionNumber: number | string;
  status: IllustrationProfileVersionStatus;
  schemaVersion: number | string;
  minMatchScore: number | string;
  minExtractionConfidence: number | string;
  publishedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type PublishedIllustrationProfileVersion = {
  profile: IllustrationProfileSummary;
  version: IllustrationProfileVersionSummary;
  fingerprints: IllustrationProfileFingerprint[];
  fieldMappings: IllustrationProfileFieldMapping[];
  projectionMappings: IllustrationProfileProjectionMapping[];
};

function cleanText(value?: string) {
  return (value || '').trim();
}

function timestamp(value: string | Date | null | undefined) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(value);
}

function jsonPayloadOrNull(value: unknown) {
  if (value === undefined) return null;
  return jsonPayload(value);
}

function cleanProductType(value?: string): IllustrationProductType {
  if (isIllustrationProductType(value)) return value;
  fail(400, 'invalid_product_type', 'Illustration product type must be iul or term.');
}

function cleanOptionalProductType(value?: string | null) {
  if (value == null || value === '') return null;
  return cleanProductType(value);
}

function cleanProfileStatus(value?: string): IllustrationProfileStatus {
  if (value === 'draft' || value === 'active' || value === 'archived') return value;
  fail(400, 'invalid_profile_status', 'Illustration profile status is invalid.');
}

function cleanOptionalProfileStatus(value?: string | null) {
  if (value == null || value === '') return null;
  return cleanProfileStatus(value);
}

function cleanTrainingStatus(value?: string): IllustrationTrainingExampleStatus {
  if (value === 'uploaded' || value === 'training' || value === 'reviewed' || value === 'rejected' || value === 'archived') return value;
  fail(400, 'invalid_training_status', 'Illustration training example status is invalid.');
}

function cleanRunType(value: IllustrationExtractionRunType): IllustrationExtractionRunType {
  if (value === 'admin_train' || value === 'admin_test' || value === 'runtime_extract') return value;
  fail(400, 'invalid_run_type', 'Illustration extraction run type is invalid.');
}

function cleanRunStatus(value: IllustrationExtractionRunStatus): IllustrationExtractionRunStatus {
  if (value === 'pending' || value === 'unsupported_profile' || value === 'needs_review' || value === 'succeeded' || value === 'failed') return value;
  fail(400, 'invalid_run_status', 'Illustration extraction run status is invalid.');
}

function cleanSha256(value?: string | null) {
  const normalized = cleanText(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    fail(400, 'invalid_file_hash', 'PDF file hash must be a 64-character SHA-256 hex digest.');
  }
  return normalized;
}

function cleanOptionalConfidence(value: number | null | undefined, path: string) {
  if (value == null) return null;
  if (!isConfidence(value)) fail(400, 'invalid_confidence', `${path} must be between 0 and 1.`);
  return value;
}

function requiredBoolean(value: unknown) {
  return value === true;
}

function assertSucceededRunExtract(input: StoreIllustrationExtractionRunInput | UpdateIllustrationExtractionRunInput) {
  if (input.status !== 'succeeded' || !input.normalizedExtract) return;
  const validation = validateIllustrationExtract(input.normalizedExtract);
  if (!validation.ok) {
    fail(400, 'invalid_extract', `Illustration extract is invalid: ${validation.issues.map(issue => issue.path).join(', ')}`);
  }
}

function mapProfileRow(row: ProfileRow): IllustrationProfileSummary {
  return {
    id: row.id,
    carrier: row.carrier,
    productName: row.productName,
    productType: row.productType,
    status: row.status,
    notes: row.notes || '',
    activeVersionId: row.activeVersionId ?? null,
    activeVersionNumber: row.activeVersionNumber == null ? null : Number(row.activeVersionNumber),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapVersionRow(row: VersionRow): IllustrationProfileVersionSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    versionNumber: Number(row.versionNumber),
    status: row.status,
    schemaVersion: Number(row.schemaVersion),
    minMatchScore: Number(row.minMatchScore),
    minExtractionConfidence: Number(row.minExtractionConfidence),
    publishedAt: row.publishedAt == null ? null : timestamp(row.publishedAt),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapFingerprintRow(row: any): IllustrationProfileFingerprint {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId,
    fingerprintType: row.fingerprintType,
    matchStrategy: row.matchStrategy,
    value: row.value,
    pageHint: row.pageHint == null ? null : Number(row.pageHint),
    required: Boolean(row.required),
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    evidenceSnippet: row.evidenceSnippet || '',
  };
}

function mapFieldMappingRow(row: any): IllustrationProfileFieldMapping {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId,
    fieldPath: row.fieldPath,
    sourceStrategy: row.sourceStrategy,
    sourceSelector: row.sourceSelector || {},
    transformRules: row.transformRules || {},
    required: Boolean(row.required),
    minConfidence: Number(row.minConfidence),
    notes: row.notes || '',
  };
}

function mapProjectionMappingRow(row: any): IllustrationProfileProjectionMapping {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId,
    projectionKey: row.projectionKey,
    sourceStrategy: row.sourceStrategy,
    rowSelector: row.rowSelector || {},
    columnMappings: row.columnMappings || {},
    valueMappings: row.valueMappings || {},
    transformRules: row.transformRules || {},
    required: Boolean(row.required),
    minConfidence: Number(row.minConfidence),
    notes: row.notes || '',
  };
}

function mapTrainingExampleRow(row: any): IllustrationTrainingExampleSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    profileVersionId: row.profileVersionId ?? null,
    fileName: row.fileName,
    fileSha256: row.fileSha256,
    mimeType: row.mimeType,
    fileSizeBytes: Number(row.fileSizeBytes),
    status: row.status,
    correctedExtract: row.correctedExtract || {},
    evidenceSnippets: row.evidenceSnippets || {},
    notes: row.notes || '',
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapExtractionRunRow(row: any): IllustrationExtractionRunSummary {
  return {
    id: row.id,
    profileId: row.profileId ?? null,
    profileVersionId: row.profileVersionId ?? null,
    trainingExampleId: row.trainingExampleId ?? null,
    runType: row.runType,
    status: row.status,
    modelProvider: row.modelProvider ?? null,
    modelName: row.modelName ?? null,
    inputSha256: row.inputSha256 ?? null,
    matchScore: row.matchScore == null ? null : Number(row.matchScore),
    extractionConfidence: row.extractionConfidence == null ? null : Number(row.extractionConfidence),
    normalizedExtract: row.normalizedExtract || {},
    evidenceSnippets: row.evidenceSnippets || {},
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    metadata: row.metadata || {},
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

async function assertProfileExists(profileId: string) {
  const sql = db();
  const row = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where id = ${profileId}
    limit 1
  `);
  if (!row) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');
  return row;
}

async function assertProfileVersionBelongsToProfile(profileId: string, profileVersionId?: string | null) {
  if (!profileVersionId) return;
  const sql = db();
  const row = await one<{ id: string }>(sql`
    select id
    from illustration_profile_versions
    where id = ${profileVersionId}
      and profile_id = ${profileId}
    limit 1
  `);
  if (!row) fail(400, 'profile_version_mismatch', 'Illustration profile version does not belong to the profile.');
}

export async function listIllustrationProfiles(search = ''): Promise<IllustrationProfileSummary[]> {
  const sql = db();
  const pattern = `%${search.trim().toLowerCase()}%`;
  const rows = await sql<ProfileRow[]>`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      av.id as "activeVersionId",
      av.version_number as "activeVersionNumber",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt"
    from illustration_profiles p
    left join lateral (
      select id, version_number
      from illustration_profile_versions
      where profile_id = p.id
        and status = 'published'
      order by published_at desc nulls last, version_number desc
      limit 1
    ) av on true
    where (${search.trim()} = '' or lower(p.carrier) like ${pattern} or lower(p.product_name) like ${pattern})
    order by p.updated_at desc
    limit 200
  `;
  return rows.map(mapProfileRow);
}

export async function getIllustrationProfile(id: string): Promise<IllustrationProfileDetail> {
  const sql = db();
  const profile = await one<ProfileRow>(sql`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      av.id as "activeVersionId",
      av.version_number as "activeVersionNumber",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt"
    from illustration_profiles p
    left join lateral (
      select id, version_number
      from illustration_profile_versions
      where profile_id = p.id
        and status = 'published'
      order by published_at desc nulls last, version_number desc
      limit 1
    ) av on true
    where p.id = ${id}
    limit 1
  `);
  if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

  const [versions, fingerprints, fieldMappings, projectionMappings, examples] = await Promise.all([
    sql<VersionRow[]>`
      select
        id,
        profile_id as "profileId",
        version_number as "versionNumber",
        status,
        schema_version as "schemaVersion",
        min_match_score as "minMatchScore",
        min_extraction_confidence as "minExtractionConfidence",
        published_at as "publishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from illustration_profile_versions
      where profile_id = ${id}
      order by version_number desc
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        fingerprint_type as "fingerprintType",
        match_strategy as "matchStrategy",
        value,
        page_hint as "pageHint",
        required,
        weight,
        confidence,
        evidence_snippet as "evidenceSnippet"
      from illustration_profile_fingerprints
      where profile_id = ${id}
      order by created_at
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        field_path as "fieldPath",
        source_strategy as "sourceStrategy",
        source_selector as "sourceSelector",
        transform_rules as "transformRules",
        required,
        min_confidence as "minConfidence",
        notes
      from illustration_profile_field_mappings
      where profile_id = ${id}
      order by field_path
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        projection_key as "projectionKey",
        source_strategy as "sourceStrategy",
        row_selector as "rowSelector",
        column_mappings as "columnMappings",
        value_mappings as "valueMappings",
        transform_rules as "transformRules",
        required,
        min_confidence as "minConfidence",
        notes
      from illustration_profile_projection_mappings
      where profile_id = ${id}
      order by projection_key
    `,
    sql`
      select
        id,
        profile_id as "profileId",
        profile_version_id as "profileVersionId",
        file_name as "fileName",
        file_sha256 as "fileSha256",
        mime_type as "mimeType",
        file_size_bytes as "fileSizeBytes",
        status,
        corrected_extract as "correctedExtract",
        evidence_snippets as "evidenceSnippets",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from illustration_training_examples
      where profile_id = ${id}
      order by created_at desc
      limit 100
    `,
  ]);

  const mappedVersions = versions.map(mapVersionRow);
  return {
    ...mapProfileRow(profile),
    versions: mappedVersions,
    draftVersion: mappedVersions.find(version => version.status === 'draft') || null,
    publishedVersion: mappedVersions.find(version => version.status === 'published') || null,
    fingerprints: fingerprints.map(mapFingerprintRow),
    fieldMappings: fieldMappings.map(mapFieldMappingRow),
    projectionMappings: projectionMappings.map(mapProjectionMappingRow),
    examples: examples.map(mapTrainingExampleRow),
  };
}

export async function createIllustrationProfile(actor: Actor, input: CreateIllustrationProfileInput): Promise<IllustrationProfileDetail> {
  const carrier = cleanText(input.carrier);
  const productName = cleanText(input.productName);
  const productType = cleanProductType(input.productType);
  const notes = cleanText(input.notes);
  if (!carrier) fail(400, 'missing_carrier', 'Illustration profile carrier is required.');
  if (!productName) fail(400, 'missing_product_name', 'Illustration profile product name is required.');

  const sql = db();
  const existing = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where lower(carrier) = ${carrier.toLowerCase()}
      and lower(product_name) = ${productName.toLowerCase()}
      and product_type = ${productType}
    limit 1
  `);
  if (existing) fail(409, 'illustration_profile_exists', 'An illustration profile already exists for this carrier and product.');

  const row = await one<{ id: string }>(sql`
    with created_profile as (
      insert into illustration_profiles (carrier, product_name, product_type, status, notes, created_by, updated_by)
      values (${carrier}, ${productName}, ${productType}, 'draft', ${notes}, ${actor.id}, ${actor.id})
      returning id
    )
    insert into illustration_profile_versions (profile_id, version_number, status, schema_version, created_by)
    select id, 1, 'draft', ${ILLUSTRATION_CONTRACT_SCHEMA_VERSION}, ${actor.id}
    from created_profile
    returning profile_id as id
  `);
  if (!row) fail(500, 'illustration_profile_create_failed', 'Could not create illustration profile.');

  await audit(actor, 'illustration_profile.create', 'illustration_profile', row.id, { carrier, productName, productType });
  return await getIllustrationProfile(row.id);
}

export async function updateIllustrationProfile(actor: Actor, id: string, input: UpdateIllustrationProfileInput): Promise<IllustrationProfileDetail> {
  const sql = db();
  const current = await one<{ id: string; carrier: string; productName: string; productType: IllustrationProductType }>(sql`
    select id, carrier, product_name as "productName", product_type as "productType"
    from illustration_profiles
    where id = ${id}
    limit 1
  `);
  if (!current) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

  const carrier = input.carrier != null ? cleanText(input.carrier) : null;
  const productName = input.productName != null ? cleanText(input.productName) : null;
  const productType = input.productType != null ? cleanProductType(input.productType) : null;
  const status = cleanOptionalProfileStatus(input.status || null);
  const notes = input.notes != null ? cleanText(input.notes) : null;
  if (carrier != null && !carrier) fail(400, 'missing_carrier', 'Illustration profile carrier is required.');
  if (productName != null && !productName) fail(400, 'missing_product_name', 'Illustration profile product name is required.');

  const nextCarrier = carrier || current.carrier;
  const nextProductName = productName || current.productName;
  const nextProductType = productType || current.productType;
  const duplicate = await one<{ id: string }>(sql`
    select id
    from illustration_profiles
    where lower(carrier) = ${nextCarrier.toLowerCase()}
      and lower(product_name) = ${nextProductName.toLowerCase()}
      and product_type = ${nextProductType}
      and id <> ${id}
    limit 1
  `);
  if (duplicate) fail(409, 'illustration_profile_exists', 'An illustration profile already exists for this carrier and product.');

  await sql`
    update illustration_profiles
    set
      carrier = coalesce(${carrier}, carrier),
      product_name = coalesce(${productName}, product_name),
      product_type = coalesce(${productType}, product_type),
      status = coalesce(${status}, status),
      notes = coalesce(${notes}, notes),
      updated_by = ${actor.id},
      updated_at = now()
    where id = ${id}
  `;
  await audit(actor, 'illustration_profile.update', 'illustration_profile', id, input as Record<string, unknown>);
  return await getIllustrationProfile(id);
}

export async function ensureDraftIllustrationProfileVersion(actor: Actor, profileId: string): Promise<IllustrationProfileVersionSummary> {
  await assertProfileExists(profileId);
  const sql = db();
  const existing = await one<VersionRow>(sql`
    select
      id,
      profile_id as "profileId",
      version_number as "versionNumber",
      status,
      schema_version as "schemaVersion",
      min_match_score as "minMatchScore",
      min_extraction_confidence as "minExtractionConfidence",
      published_at as "publishedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from illustration_profile_versions
    where profile_id = ${profileId}
      and status = 'draft'
    limit 1
  `);
  if (existing) return mapVersionRow(existing);

  const row = await one<VersionRow>(sql`
    insert into illustration_profile_versions (profile_id, version_number, status, schema_version, created_by)
    values (
      ${profileId},
      (select coalesce(max(version_number), 0) + 1 from illustration_profile_versions where profile_id = ${profileId}),
      'draft',
      ${ILLUSTRATION_CONTRACT_SCHEMA_VERSION},
      ${actor.id}
    )
    returning
      id,
      profile_id as "profileId",
      version_number as "versionNumber",
      status,
      schema_version as "schemaVersion",
      min_match_score as "minMatchScore",
      min_extraction_confidence as "minExtractionConfidence",
      published_at as "publishedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'illustration_profile_version_create_failed', 'Could not create illustration profile version.');
  await audit(actor, 'illustration_profile_version.create_draft', 'illustration_profile', profileId, { versionId: row.id });
  return mapVersionRow(row);
}

export async function publishIllustrationProfileVersion(actor: Actor, profileId: string, profileVersionId: string): Promise<IllustrationProfileDetail> {
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);
  await validatePublishableIllustrationProfileVersion(profileId, profileVersionId);
  const sql = db();
  await sql`
    update illustration_profile_versions
    set status = 'archived', updated_at = now()
    where profile_id = ${profileId}
      and status = 'published'
      and id <> ${profileVersionId}
  `;
  const row = await one<{ id: string }>(sql`
    update illustration_profile_versions
    set
      status = 'published',
      published_at = now(),
      published_by = ${actor.id},
      updated_at = now()
    where id = ${profileVersionId}
      and profile_id = ${profileId}
    returning id
  `);
  if (!row) fail(404, 'illustration_profile_version_not_found', 'Illustration profile version not found.');
  await sql`
    update illustration_profiles
    set status = 'active', updated_by = ${actor.id}, updated_at = now()
    where id = ${profileId}
  `;
  await audit(actor, 'illustration_profile_version.publish', 'illustration_profile', profileId, { versionId: profileVersionId });
  return await getIllustrationProfile(profileId);
}

export async function validatePublishableIllustrationProfileVersion(profileId: string, profileVersionId: string) {
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);
  const sql = db();
  const profile = await one<{ productType: IllustrationProductType }>(sql`
    select product_type as "productType"
    from illustration_profiles
    where id = ${profileId}
    limit 1
  `);
  if (!profile) fail(404, 'illustration_profile_not_found', 'Illustration profile not found.');

  const [fingerprints, fieldMappings] = await Promise.all([
    listFingerprintsForVersion(profileVersionId),
    listFieldMappingsForVersion(profileVersionId),
  ]);
  const requiredPaths = requiredIllustrationFieldPaths(profile.productType);
  const missingFieldPaths = requiredPaths.filter(path =>
    !fieldMappings.some(mapping => mapping.fieldPath === path && mapping.required && mapping.sourceStrategy !== 'manual'),
  );
  if (missingFieldPaths.length) {
    fail(400, 'publish_validation_failed', `Missing required field mappings: ${missingFieldPaths.join(', ')}.`);
  }

  const requiredFingerprints = fingerprints.filter(fingerprint => fingerprint.required);
  if (!requiredFingerprints.length) {
    fail(400, 'publish_validation_failed', 'At least one required fingerprint is needed before publishing.');
  }
  const hasCarrierFingerprint = requiredFingerprints.some(fingerprint => fingerprint.fingerprintType === 'carrier');
  const hasNonCarrierFingerprint = requiredFingerprints.some(fingerprint => fingerprint.fingerprintType !== 'carrier');
  if (!hasCarrierFingerprint || !hasNonCarrierFingerprint) {
    fail(400, 'publish_validation_failed', 'Publishing requires required carrier and non-carrier product/form fingerprints.');
  }

  const invalidConfidence = [...fingerprints, ...fieldMappings].find(item => !isConfidence(item.confidence ?? item.minConfidence));
  if (invalidConfidence) {
    fail(400, 'publish_validation_failed', 'Fingerprints and mappings must have confidence values between 0 and 1.');
  }

  return { ok: true };
}

export async function listPublishedIllustrationProfileVersions(productType?: IllustrationProductType | null): Promise<PublishedIllustrationProfileVersion[]> {
  const cleanType = cleanOptionalProductType(productType || null);
  const sql = db();
  const rows = await sql<Array<ProfileRow & VersionRow & { profileVersionId: string }>>`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      v.id as "profileVersionId",
      v.version_number as "versionNumber",
      v.status as "versionStatus",
      v.schema_version as "schemaVersion",
      v.min_match_score as "minMatchScore",
      v.min_extraction_confidence as "minExtractionConfidence",
      v.published_at as "publishedAt",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
      v.created_at as "versionCreatedAt",
      v.updated_at as "versionUpdatedAt"
    from illustration_profiles p
    join illustration_profile_versions v on v.profile_id = p.id
    where p.status = 'active'
      and v.status = 'published'
      and (${cleanType || ''} = '' or p.product_type = ${cleanType})
    order by p.carrier, p.product_name, v.published_at desc nulls last, v.version_number desc
  `;

  return rows.map(row => ({
    profile: mapProfileRow({ ...row, activeVersionId: row.profileVersionId, activeVersionNumber: row.versionNumber }),
    version: mapVersionRow({
      id: row.profileVersionId,
      profileId: row.id,
      versionNumber: row.versionNumber,
      status: row.versionStatus as IllustrationProfileVersionStatus,
      schemaVersion: row.schemaVersion,
      minMatchScore: row.minMatchScore,
      minExtractionConfidence: row.minExtractionConfidence,
      publishedAt: row.publishedAt,
      createdAt: (row as any).versionCreatedAt,
      updatedAt: (row as any).versionUpdatedAt,
    }),
    fingerprints: [],
    fieldMappings: [],
    projectionMappings: [],
  }));
}

export async function listPublishedIllustrationProfileVersionDetails(productType?: IllustrationProductType | null): Promise<PublishedIllustrationProfileVersion[]> {
  const summaries = await listPublishedIllustrationProfileVersions(productType);
  const details = await Promise.all(summaries.map(summary => getPublishedIllustrationProfileVersion(summary.profile.id)));
  return details.filter((detail): detail is PublishedIllustrationProfileVersion => Boolean(detail));
}

export async function getPublishedIllustrationProfileVersion(profileId: string): Promise<PublishedIllustrationProfileVersion | null> {
  const sql = db();
  const row = await one<any>(sql`
    select
      p.id,
      p.carrier,
      p.product_name as "productName",
      p.product_type as "productType",
      p.status,
      p.notes,
      v.id as "profileVersionId",
      v.version_number as "versionNumber",
      v.status as "versionStatus",
      v.schema_version as "schemaVersion",
      v.min_match_score as "minMatchScore",
      v.min_extraction_confidence as "minExtractionConfidence",
      v.published_at as "publishedAt",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
      v.created_at as "versionCreatedAt",
      v.updated_at as "versionUpdatedAt"
    from illustration_profiles p
    join illustration_profile_versions v on v.profile_id = p.id
    where p.id = ${profileId}
      and p.status = 'active'
      and v.status = 'published'
    order by v.published_at desc nulls last, v.version_number desc
    limit 1
  `);
  if (!row) return null;

  const [fingerprints, fieldMappings, projectionMappings] = await Promise.all([
    listFingerprintsForVersion(row.profileVersionId),
    listFieldMappingsForVersion(row.profileVersionId),
    listProjectionMappingsForVersion(row.profileVersionId),
  ]);

  return {
    profile: mapProfileRow({ ...row, activeVersionId: row.profileVersionId, activeVersionNumber: row.versionNumber }),
    version: mapVersionRow({
      id: row.profileVersionId,
      profileId: row.id,
      versionNumber: row.versionNumber,
      status: row.versionStatus,
      schemaVersion: row.schemaVersion,
      minMatchScore: row.minMatchScore,
      minExtractionConfidence: row.minExtractionConfidence,
      publishedAt: row.publishedAt,
      createdAt: row.versionCreatedAt,
      updatedAt: row.versionUpdatedAt,
    }),
    fingerprints,
    fieldMappings,
    projectionMappings,
  };
}

export async function listFingerprintsForVersion(profileVersionId: string): Promise<IllustrationProfileFingerprint[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      fingerprint_type as "fingerprintType",
      match_strategy as "matchStrategy",
      value,
      page_hint as "pageHint",
      required,
      weight,
      confidence,
      evidence_snippet as "evidenceSnippet"
    from illustration_profile_fingerprints
    where profile_version_id = ${profileVersionId}
    order by required desc, weight desc, created_at
  `;
  return rows.map(mapFingerprintRow);
}

export async function listFieldMappingsForVersion(profileVersionId: string): Promise<IllustrationProfileFieldMapping[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      field_path as "fieldPath",
      source_strategy as "sourceStrategy",
      source_selector as "sourceSelector",
      transform_rules as "transformRules",
      required,
      min_confidence as "minConfidence",
      notes
    from illustration_profile_field_mappings
    where profile_version_id = ${profileVersionId}
    order by required desc, field_path
  `;
  return rows.map(mapFieldMappingRow);
}

export async function listProjectionMappingsForVersion(profileVersionId: string): Promise<IllustrationProfileProjectionMapping[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      projection_key as "projectionKey",
      source_strategy as "sourceStrategy",
      row_selector as "rowSelector",
      column_mappings as "columnMappings",
      value_mappings as "valueMappings",
      transform_rules as "transformRules",
      required,
      min_confidence as "minConfidence",
      notes
    from illustration_profile_projection_mappings
    where profile_version_id = ${profileVersionId}
    order by required desc, projection_key
  `;
  return rows.map(mapProjectionMappingRow);
}

export async function storeIllustrationTrainingExample(
  actor: Actor,
  profileId: string,
  input: StoreIllustrationTrainingExampleInput,
): Promise<IllustrationTrainingExampleSummary> {
  await assertProfileExists(profileId);
  const profileVersionId = input.profileVersionId ?? (await ensureDraftIllustrationProfileVersion(actor, profileId)).id;
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);

  const fileName = cleanText(input.fileName);
  const fileSha256 = cleanSha256(input.fileSha256);
  const status = cleanTrainingStatus(input.status || 'uploaded');
  if (!fileName) fail(400, 'missing_file_name', 'Training example file name is required.');
  if (input.mimeType !== 'application/pdf') fail(400, 'invalid_mime_type', 'Training examples must be PDF files.');
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes < 1) fail(400, 'invalid_file_size', 'Training example file size is invalid.');

  const sql = db();
  const row = await one<any>(sql`
    insert into illustration_training_examples (
      profile_id,
      profile_version_id,
      file_name,
      file_sha256,
      mime_type,
      file_size_bytes,
      status,
      corrected_extract,
      evidence_snippets,
      notes,
      uploaded_by
    ) values (
      ${profileId},
      ${profileVersionId},
      ${fileName},
      ${fileSha256},
      ${input.mimeType},
      ${input.fileSizeBytes},
      ${status},
      ${jsonPayload(input.correctedExtract)},
      ${jsonPayload(input.evidenceSnippets)},
      ${cleanText(input.notes)},
      ${actor.id}
    )
    on conflict (profile_id, file_sha256) do update set
      profile_version_id = coalesce(excluded.profile_version_id, illustration_training_examples.profile_version_id),
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      status = excluded.status,
      corrected_extract = case
        when excluded.corrected_extract = '{}'::jsonb then illustration_training_examples.corrected_extract
        else excluded.corrected_extract
      end,
      evidence_snippets = case
        when excluded.evidence_snippets = '{}'::jsonb then illustration_training_examples.evidence_snippets
        else excluded.evidence_snippets
      end,
      notes = coalesce(nullif(excluded.notes, ''), illustration_training_examples.notes),
      updated_at = now()
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      file_name as "fileName",
      file_sha256 as "fileSha256",
      mime_type as "mimeType",
      file_size_bytes as "fileSizeBytes",
      status,
      corrected_extract as "correctedExtract",
      evidence_snippets as "evidenceSnippets",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'training_example_store_failed', 'Could not store illustration training example.');

  await audit(actor, 'illustration_training_example.store', 'illustration_profile', profileId, {
    exampleId: row.id,
    fileSha256,
    profileVersionId,
  });
  return mapTrainingExampleRow(row);
}

async function getTrainingExampleForProfile(profileId: string, exampleId: string) {
  const sql = db();
  const row = await one<any>(sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      file_name as "fileName",
      file_sha256 as "fileSha256",
      mime_type as "mimeType",
      file_size_bytes as "fileSizeBytes",
      status,
      corrected_extract as "correctedExtract",
      evidence_snippets as "evidenceSnippets",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from illustration_training_examples
    where id = ${exampleId}
      and profile_id = ${profileId}
    limit 1
  `);
  if (!row) fail(404, 'training_example_not_found', 'Illustration training example not found.');
  return mapTrainingExampleRow(row);
}

export async function updateIllustrationTrainingExample(
  actor: Actor,
  profileId: string,
  exampleId: string,
  input: UpdateIllustrationTrainingExampleInput,
): Promise<IllustrationTrainingExampleSummary> {
  const current = await getTrainingExampleForProfile(profileId, exampleId);
  const profileVersionId = input.profileVersionId ?? current.profileVersionId;
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);

  const status = input.status ? cleanTrainingStatus(input.status) : 'reviewed';
  const notes = input.notes != null ? cleanText(input.notes) : null;
  const sql = db();
  const row = await one<any>(sql`
    update illustration_training_examples
    set
      profile_version_id = coalesce(${profileVersionId || null}, profile_version_id),
      status = ${status},
      corrected_extract = coalesce(${jsonPayloadOrNull(input.correctedExtract)}, corrected_extract),
      evidence_snippets = coalesce(${jsonPayloadOrNull(input.evidenceSnippets)}, evidence_snippets),
      notes = coalesce(${notes}, notes),
      updated_at = now()
    where id = ${exampleId}
      and profile_id = ${profileId}
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      file_name as "fileName",
      file_sha256 as "fileSha256",
      mime_type as "mimeType",
      file_size_bytes as "fileSizeBytes",
      status,
      corrected_extract as "correctedExtract",
      evidence_snippets as "evidenceSnippets",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'training_example_update_failed', 'Could not update illustration training example.');
  await audit(actor, 'illustration_training_example.update', 'illustration_profile', profileId, {
    exampleId,
    profileVersionId,
    status,
  });
  return mapTrainingExampleRow(row);
}

export async function replaceIllustrationProfileVersionMappings(
  actor: Actor,
  profileId: string,
  profileVersionId: string,
  input: Pick<IllustrationTrainingCorrectionInput, 'fingerprints' | 'fieldMappings' | 'projectionMappings'>,
) {
  await assertProfileVersionBelongsToProfile(profileId, profileVersionId);
  const sql = db();

  if (input.fingerprints) {
    await sql`delete from illustration_profile_fingerprints where profile_id = ${profileId} and profile_version_id = ${profileVersionId}`;
    for (const fingerprint of input.fingerprints) {
      await sql`
        insert into illustration_profile_fingerprints (
          profile_id,
          profile_version_id,
          fingerprint_type,
          match_strategy,
          value,
          page_hint,
          required,
          weight,
          confidence,
          evidence_snippet
        ) values (
          ${profileId},
          ${profileVersionId},
          ${fingerprint.fingerprintType},
          ${fingerprint.matchStrategy},
          ${cleanText(fingerprint.value)},
          ${fingerprint.pageHint ?? null},
          ${requiredBoolean(fingerprint.required)},
          ${fingerprint.weight ?? 1},
          ${fingerprint.confidence ?? 1},
          ${fingerprint.evidenceSnippet || ''}
        )
      `;
    }
  }

  if (input.fieldMappings) {
    await sql`delete from illustration_profile_field_mappings where profile_id = ${profileId} and profile_version_id = ${profileVersionId}`;
    for (const mapping of input.fieldMappings) {
      await sql`
        insert into illustration_profile_field_mappings (
          profile_id,
          profile_version_id,
          field_path,
          source_strategy,
          source_selector,
          transform_rules,
          required,
          min_confidence,
          notes
        ) values (
          ${profileId},
          ${profileVersionId},
          ${mapping.fieldPath},
          ${mapping.sourceStrategy},
          ${jsonPayload(mapping.sourceSelector)},
          ${jsonPayload(mapping.transformRules)},
          ${requiredBoolean(mapping.required)},
          ${mapping.minConfidence ?? 0.8},
          ${mapping.notes || ''}
        )
      `;
    }
  }

  if (input.projectionMappings) {
    await sql`delete from illustration_profile_projection_mappings where profile_id = ${profileId} and profile_version_id = ${profileVersionId}`;
    for (const mapping of input.projectionMappings) {
      await sql`
        insert into illustration_profile_projection_mappings (
          profile_id,
          profile_version_id,
          projection_key,
          source_strategy,
          row_selector,
          column_mappings,
          value_mappings,
          transform_rules,
          required,
          min_confidence,
          notes
        ) values (
          ${profileId},
          ${profileVersionId},
          ${mapping.projectionKey},
          ${mapping.sourceStrategy},
          ${jsonPayload(mapping.rowSelector)},
          ${jsonPayload(mapping.columnMappings)},
          ${jsonPayload(mapping.valueMappings)},
          ${jsonPayload(mapping.transformRules)},
          ${requiredBoolean(mapping.required)},
          ${mapping.minConfidence ?? 0.8},
          ${mapping.notes || ''}
        )
      `;
    }
  }

  await sql`
    update illustration_profile_versions
    set updated_at = now()
    where id = ${profileVersionId}
      and profile_id = ${profileId}
  `;
  await sql`
    update illustration_profiles
    set updated_by = ${actor.id}, updated_at = now()
    where id = ${profileId}
  `;
  await audit(actor, 'illustration_profile_mappings.replace', 'illustration_profile', profileId, {
    profileVersionId,
    fingerprints: input.fingerprints?.length,
    fieldMappings: input.fieldMappings?.length,
    projectionMappings: input.projectionMappings?.length,
  });
}

export async function applyIllustrationTrainingCorrection(
  actor: Actor,
  profileId: string,
  exampleId: string,
  input: IllustrationTrainingCorrectionInput,
) {
  const current = await getTrainingExampleForProfile(profileId, exampleId);
  const profileVersionId = input.profileVersionId ?? current.profileVersionId ?? (await ensureDraftIllustrationProfileVersion(actor, profileId)).id;
  const example = await updateIllustrationTrainingExample(actor, profileId, exampleId, {
    ...input,
    profileVersionId,
    status: input.status || 'reviewed',
  });
  if (input.fingerprints || input.fieldMappings || input.projectionMappings) {
    await replaceIllustrationProfileVersionMappings(actor, profileId, profileVersionId, input);
  }
  return {
    example,
    profile: await getIllustrationProfile(profileId),
  };
}

export async function recordIllustrationExtractionRun(input: StoreIllustrationExtractionRunInput): Promise<IllustrationExtractionRunSummary> {
  assertSucceededRunExtract(input);
  const runType = cleanRunType(input.runType);
  const status = cleanRunStatus(input.status);
  const inputSha256 = input.inputSha256 ? cleanSha256(input.inputSha256) : null;
  const matchScore = cleanOptionalConfidence(input.matchScore, 'matchScore');
  const extractionConfidence = cleanOptionalConfidence(input.extractionConfidence, 'extractionConfidence');

  const sql = db();
  const row = await one<any>(sql`
    insert into illustration_extraction_runs (
      profile_id,
      profile_version_id,
      training_example_id,
      run_type,
      status,
      model_provider,
      model_name,
      input_sha256,
      match_score,
      extraction_confidence,
      normalized_extract,
      evidence_snippets,
      error_code,
      error_message,
      metadata,
      created_by
    ) values (
      ${input.profileId || null},
      ${input.profileVersionId || null},
      ${input.trainingExampleId || null},
      ${runType},
      ${status},
      ${input.modelProvider || null},
      ${input.modelName || null},
      ${inputSha256},
      ${matchScore},
      ${extractionConfidence},
      ${jsonPayload(input.normalizedExtract)},
      ${jsonPayload(input.evidenceSnippets)},
      ${input.errorCode || null},
      ${input.errorMessage || null},
      ${jsonPayload(input.metadata)},
      ${input.createdBy || null}
    )
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      training_example_id as "trainingExampleId",
      run_type as "runType",
      status,
      model_provider as "modelProvider",
      model_name as "modelName",
      input_sha256 as "inputSha256",
      match_score as "matchScore",
      extraction_confidence as "extractionConfidence",
      normalized_extract as "normalizedExtract",
      evidence_snippets as "evidenceSnippets",
      error_code as "errorCode",
      error_message as "errorMessage",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'extraction_run_store_failed', 'Could not store illustration extraction run.');
  return mapExtractionRunRow(row);
}

export async function updateIllustrationExtractionRun(
  id: string,
  input: UpdateIllustrationExtractionRunInput,
): Promise<IllustrationExtractionRunSummary> {
  assertSucceededRunExtract(input);
  const status = input.status ? cleanRunStatus(input.status) : null;
  const matchScore = cleanOptionalConfidence(input.matchScore, 'matchScore');
  const extractionConfidence = cleanOptionalConfidence(input.extractionConfidence, 'extractionConfidence');
  const sql = db();
  const row = await one<any>(sql`
    update illustration_extraction_runs
    set
      profile_id = coalesce(${input.profileId ?? null}, profile_id),
      profile_version_id = coalesce(${input.profileVersionId ?? null}, profile_version_id),
      training_example_id = coalesce(${input.trainingExampleId ?? null}, training_example_id),
      status = coalesce(${status}, status),
      model_provider = coalesce(${input.modelProvider ?? null}, model_provider),
      model_name = coalesce(${input.modelName ?? null}, model_name),
      match_score = coalesce(${matchScore}, match_score),
      extraction_confidence = coalesce(${extractionConfidence}, extraction_confidence),
      normalized_extract = coalesce(${jsonPayloadOrNull(input.normalizedExtract)}, normalized_extract),
      evidence_snippets = coalesce(${jsonPayloadOrNull(input.evidenceSnippets)}, evidence_snippets),
      error_code = coalesce(${input.errorCode ?? null}, error_code),
      error_message = coalesce(${input.errorMessage ?? null}, error_message),
      metadata = coalesce(${jsonPayloadOrNull(input.metadata)}, metadata),
      updated_at = now()
    where id = ${id}
    returning
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      training_example_id as "trainingExampleId",
      run_type as "runType",
      status,
      model_provider as "modelProvider",
      model_name as "modelName",
      input_sha256 as "inputSha256",
      match_score as "matchScore",
      extraction_confidence as "extractionConfidence",
      normalized_extract as "normalizedExtract",
      evidence_snippets as "evidenceSnippets",
      error_code as "errorCode",
      error_message as "errorMessage",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  if (!row) fail(404, 'extraction_run_not_found', 'Illustration extraction run not found.');
  return mapExtractionRunRow(row);
}

export async function listIllustrationExtractionRuns(profileId?: string): Promise<IllustrationExtractionRunSummary[]> {
  const sql = db();
  const rows = await sql`
    select
      id,
      profile_id as "profileId",
      profile_version_id as "profileVersionId",
      training_example_id as "trainingExampleId",
      run_type as "runType",
      status,
      model_provider as "modelProvider",
      model_name as "modelName",
      input_sha256 as "inputSha256",
      match_score as "matchScore",
      extraction_confidence as "extractionConfidence",
      normalized_extract as "normalizedExtract",
      evidence_snippets as "evidenceSnippets",
      error_code as "errorCode",
      error_message as "errorMessage",
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from illustration_extraction_runs
    where (${profileId || ''} = '' or profile_id = ${profileId || null})
    order by created_at desc
    limit 200
  `;
  return rows.map(mapExtractionRunRow);
}

export function extractionRunStatusForRuntime(status: IllustrationRuntimeExtractStatus) {
  return extractionRunStatusForRuntimeStatus(status);
}
