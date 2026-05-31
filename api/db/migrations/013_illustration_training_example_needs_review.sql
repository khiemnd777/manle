alter table illustration_training_examples
  drop constraint if exists illustration_training_examples_status_check;

alter table illustration_training_examples
  add constraint illustration_training_examples_status_check
  check (status in ('uploaded', 'training', 'needs_review', 'reviewed', 'rejected', 'archived'));

update illustration_training_examples example
set status = 'needs_review',
    updated_at = now()
where example.status = 'training'
  and exists (
    select 1
    from illustration_extraction_runs run
    where run.training_example_id = example.id
      and run.status in ('succeeded', 'needs_review')
  );

update illustration_training_examples example
set status = 'rejected',
    updated_at = now()
where example.status = 'training'
  and exists (
    select 1
    from illustration_extraction_runs run
    where run.training_example_id = example.id
      and run.status = 'failed'
  );

update illustration_training_examples
set corrected_extract = (corrected_extract #>> '{}')::jsonb
where jsonb_typeof(corrected_extract) = 'string'
  and (corrected_extract #>> '{}') ~ '^\s*[\{\[]';

update illustration_training_examples
set evidence_snippets = (evidence_snippets #>> '{}')::jsonb
where jsonb_typeof(evidence_snippets) = 'string'
  and (evidence_snippets #>> '{}') ~ '^\s*[\{\[]';

update illustration_extraction_runs
set normalized_extract = (normalized_extract #>> '{}')::jsonb
where jsonb_typeof(normalized_extract) = 'string'
  and (normalized_extract #>> '{}') ~ '^\s*[\{\[]';

update illustration_extraction_runs
set evidence_snippets = (evidence_snippets #>> '{}')::jsonb
where jsonb_typeof(evidence_snippets) = 'string'
  and (evidence_snippets #>> '{}') ~ '^\s*[\{\[]';

update illustration_extraction_runs
set metadata = (metadata #>> '{}')::jsonb
where jsonb_typeof(metadata) = 'string'
  and (metadata #>> '{}') ~ '^\s*[\{\[]';
