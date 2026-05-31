create extension if not exists pgcrypto;

create table if not exists illustration_profiles (
  id uuid primary key default gen_random_uuid(),
  carrier text not null,
  product_name text not null,
  product_type text not null check (product_type in ('iul', 'term')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  notes text not null default '',
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists illustration_profiles_identity_uidx
  on illustration_profiles (lower(carrier), lower(product_name), product_type);
create index if not exists illustration_profiles_status_idx
  on illustration_profiles (status);
create index if not exists illustration_profiles_carrier_idx
  on illustration_profiles (lower(carrier));

create table if not exists illustration_profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references illustration_profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  schema_version integer not null default 1 check (schema_version > 0),
  min_match_score numeric(5,4) not null default 0.8000 check (min_match_score >= 0 and min_match_score <= 1),
  min_extraction_confidence numeric(5,4) not null default 0.8000 check (min_extraction_confidence >= 0 and min_extraction_confidence <= 1),
  profile_config jsonb not null default '{}'::jsonb,
  training_summary jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, profile_id),
  unique (profile_id, version_number)
);

create unique index if not exists illustration_profile_versions_one_draft_uidx
  on illustration_profile_versions (profile_id)
  where status = 'draft';
create index if not exists illustration_profile_versions_profile_status_idx
  on illustration_profile_versions (profile_id, status, version_number desc);
create index if not exists illustration_profile_versions_published_idx
  on illustration_profile_versions (profile_id, published_at desc)
  where status = 'published';

create table if not exists illustration_training_examples (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references illustration_profiles(id) on delete cascade,
  profile_version_id uuid references illustration_profile_versions(id) on delete set null,
  file_name text not null,
  file_sha256 text not null check (length(file_sha256) = 64),
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  status text not null default 'uploaded' check (status in ('uploaded', 'training', 'needs_review', 'reviewed', 'rejected', 'archived')),
  corrected_extract jsonb not null default '{}'::jsonb,
  evidence_snippets jsonb not null default '{}'::jsonb,
  notes text not null default '',
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists illustration_training_examples_profile_file_uidx
  on illustration_training_examples (profile_id, file_sha256);
create index if not exists illustration_training_examples_profile_idx
  on illustration_training_examples (profile_id, created_at desc);
create index if not exists illustration_training_examples_version_idx
  on illustration_training_examples (profile_version_id, created_at desc);
create index if not exists illustration_training_examples_status_idx
  on illustration_training_examples (status);

create table if not exists illustration_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references illustration_profiles(id) on delete set null,
  profile_version_id uuid references illustration_profile_versions(id) on delete set null,
  training_example_id uuid references illustration_training_examples(id) on delete set null,
  run_type text not null check (run_type in ('admin_train', 'admin_test', 'runtime_extract')),
  status text not null check (status in ('pending', 'unsupported_profile', 'needs_review', 'succeeded', 'failed')),
  model_provider text,
  model_name text,
  input_sha256 text check (input_sha256 is null or length(input_sha256) = 64),
  match_score numeric(5,4) check (match_score is null or (match_score >= 0 and match_score <= 1)),
  extraction_confidence numeric(5,4) check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  normalized_extract jsonb not null default '{}'::jsonb,
  evidence_snippets jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists illustration_extraction_runs_profile_created_idx
  on illustration_extraction_runs (profile_id, created_at desc);
create index if not exists illustration_extraction_runs_version_created_idx
  on illustration_extraction_runs (profile_version_id, created_at desc);
create index if not exists illustration_extraction_runs_example_created_idx
  on illustration_extraction_runs (training_example_id, created_at desc);
create index if not exists illustration_extraction_runs_status_idx
  on illustration_extraction_runs (status, created_at desc);
create index if not exists illustration_extraction_runs_type_idx
  on illustration_extraction_runs (run_type, created_at desc);

create table if not exists illustration_profile_fingerprints (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references illustration_profiles(id) on delete cascade,
  profile_version_id uuid not null,
  fingerprint_type text not null check (fingerprint_type in ('carrier', 'product', 'form', 'version', 'text', 'regex', 'layout')),
  match_strategy text not null default 'contains' check (match_strategy in ('contains', 'equals', 'regex', 'normalized_contains')),
  value text not null,
  page_hint integer check (page_hint is null or page_hint > 0),
  required boolean not null default true,
  weight numeric(8,4) not null default 1.0000 check (weight >= 0),
  confidence numeric(5,4) not null default 1.0000 check (confidence >= 0 and confidence <= 1),
  evidence_snippet text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_version_id, profile_id) references illustration_profile_versions(id, profile_id) on delete cascade
);

create unique index if not exists illustration_profile_fingerprints_version_value_uidx
  on illustration_profile_fingerprints (profile_version_id, fingerprint_type, match_strategy, value);
create index if not exists illustration_profile_fingerprints_profile_idx
  on illustration_profile_fingerprints (profile_id, fingerprint_type);
create index if not exists illustration_profile_fingerprints_version_idx
  on illustration_profile_fingerprints (profile_version_id, required);

create table if not exists illustration_profile_field_mappings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references illustration_profiles(id) on delete cascade,
  profile_version_id uuid not null,
  field_path text not null,
  source_strategy text not null check (source_strategy in ('label_value', 'regex', 'table_cell', 'filename', 'constant', 'manual')),
  source_selector jsonb not null default '{}'::jsonb,
  transform_rules jsonb not null default '{}'::jsonb,
  required boolean not null default false,
  min_confidence numeric(5,4) not null default 0.8000 check (min_confidence >= 0 and min_confidence <= 1),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_version_id, profile_id) references illustration_profile_versions(id, profile_id) on delete cascade
);

create unique index if not exists illustration_profile_field_mappings_version_field_uidx
  on illustration_profile_field_mappings (profile_version_id, field_path);
create index if not exists illustration_profile_field_mappings_profile_idx
  on illustration_profile_field_mappings (profile_id);
create index if not exists illustration_profile_field_mappings_required_idx
  on illustration_profile_field_mappings (profile_version_id, required);

create table if not exists illustration_profile_projection_mappings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references illustration_profiles(id) on delete cascade,
  profile_version_id uuid not null,
  projection_key text not null,
  source_strategy text not null check (source_strategy in ('table', 'summary_block', 'regex', 'manual')),
  row_selector jsonb not null default '{}'::jsonb,
  column_mappings jsonb not null default '{}'::jsonb,
  value_mappings jsonb not null default '{}'::jsonb,
  transform_rules jsonb not null default '{}'::jsonb,
  required boolean not null default false,
  min_confidence numeric(5,4) not null default 0.8000 check (min_confidence >= 0 and min_confidence <= 1),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_version_id, profile_id) references illustration_profile_versions(id, profile_id) on delete cascade
);

create unique index if not exists illustration_profile_projection_mappings_version_key_uidx
  on illustration_profile_projection_mappings (profile_version_id, projection_key);
create index if not exists illustration_profile_projection_mappings_profile_idx
  on illustration_profile_projection_mappings (profile_id);
create index if not exists illustration_profile_projection_mappings_required_idx
  on illustration_profile_projection_mappings (profile_version_id, required);
