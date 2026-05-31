# MANLE Current State

## Handoff

Goal:
Build a production-like AI-assisted illustration profile training system so
admin users can train and publish carrier/product profiles, and MANLE generator
users can upload supported illustration PDFs that render into the right-side
card output used for PDF/PNG/JPG export.

Current state:
- Planning and requirements are complete.
- Slice 1 database schema implementation has been added.
- Slice 2 API/domain extraction contracts have been added under
  `api/src/types/illustration.ts`.
- Slice 3 profile repository/service skeletons have been added under
  `api/src/services/illustrations.ts`.
- Slice 4 backend PDF text/layout extraction has been added under
  `api/src/services/pdfExtraction.ts`.
- Slice 5 deterministic published profile fingerprint matching has been added
  under `api/src/services/illustrationMatching.ts`.
- Slice 6 OpenAI structured extraction service for admin training has been
  added under `api/src/services/openaiIllustrationExtraction.ts`.
- Slice 7 admin illustration profile CRUD APIs have been added in
  `api/src/index.ts`.
- Slice 8 admin train/test/publish APIs have been added in `api/src/index.ts`.
- Slice 9 admin API client types and methods have been added in
  `admin/src/api/client.ts`.
- Slice 10 admin profile list/create/detail UI has been added under
  `admin/src/views/IllustrationProfilesView.tsx`.
- Slice 11 admin mapping review/edit UI has been added in the illustration
  profile detail workbench.
- Slice 12 generator runtime extraction API has been added at
  `POST /api/illustrations/extract`.
- Slice 13 generator upload flow now calls the backend runtime extraction API.
- Slice 14 normalized generator extracts now render through the existing
  right-side IUL/Term card state paths.
- Slice 15 regression verification is complete. Local Cindy Transamerica FFIUL
  and Lauren Life Insurance Company of the Southwest FlexLife profiles were
  seeded/published, runtime extraction returned `succeeded` for both known
  samples, and an unsupported Nationwide IUL sample returned
  `unsupported_profile`.
- Slice 16 final validation and handoff update is complete.
- All planned implementation slices 0-16 are complete in the working tree.
- Generator runtime must not learn new carriers from customer uploads.
- Generator runtime must only render when a published admin-approved profile
  matches the uploaded PDF.
- Admin training uses OpenAI on the backend to propose mappings, but admin
  review/publish is required before customer uploads can use a profile.
- Backend PDF extraction preserves the original uploaded byte length before
  handing the buffer to PDF.js because PDF.js can detach the typed-array buffer
  during parsing.
- Admin training examples now move from `training` to `needs_review` after
  OpenAI returns a proposal, or to `rejected` when training fails, so saved
  profile details do not look stuck after the synchronous train request ends.
- Admin training runs now persist the full review proposal in run metadata and
  profile detail includes recent runs so Admin can reopen mapping review after a
  refresh.
- The right-side card output is the final source of truth for customer export.

OpenAI model configuration:
```env
OPENAI_API_KEY=...
OPENAI_EXTRACTOR_FAST_MODEL=gpt-4.1-nano
OPENAI_EXTRACTOR_MODEL=gpt-4o-mini
OPENAI_EXTRACTOR_RETRY_MODEL=gpt-4.1-mini
OPENAI_EXTRACTOR_ALLOW_RETRY=true
OPENAI_EXTRACTOR_ALLOW_ESCALATION=false
```

OpenAI usage rules:
- OpenAI runs only on the API backend, never in frontend code.
- Admin training calls OpenAI to propose fingerprints, field mappings,
  projection mappings, normalized sample output, evidence, and confidence.
- Runtime generator uploads should not call OpenAI by default.
- If runtime cannot match a published profile, return an unsupported profile
  error and do not render from that upload.
- If runtime extraction fails validation or confidence thresholds, return a
  needs-review/profile-update error and do not silently render/export.
- Expensive escalation models are disabled by default.

Normalized output target:
```ts
IllustrationExtract {
  profileId: string;
  carrier: string;
  productName: string;
  productType: "iul" | "term";
  client: {
    fullName: string;
    age?: number;
    gender?: "M" | "F";
    state?: string;
    riskClass?: string;
  };
  policy: {
    faceAmount?: number;
    monthlyPremium?: number;
    premiumMode?: "monthly" | "annual" | "quarterly";
    payYears?: number;
    termLength?: number;
  };
  projections?: Array<{
    year?: number;
    age: number;
    policyValue?: number;
    cashSurrenderValue?: number;
    cashValue?: number;
    deathBenefit?: number;
  }>;
  agent?: {
    name?: string;
    phone?: string;
  };
  evidence: Record<string, { page: number; text: string; confidence: number }>;
}
```

Generator runtime flow:
1. User uploads PDF in the generator.
2. FE sends the PDF to `POST /api/illustrations/extract`.
3. API extracts PDF text/layout with backend PDF.js.
4. API detects carrier/product/form fingerprints.
5. If no published profile matches, API returns `unsupported_profile`.
6. If a published profile matches, API applies approved mappings without
   calling OpenAI by default.
7. API builds and validates `IllustrationExtract`.
8. If validation passes, FE applies data to generator form/state and renders
   the right-side card.
9. Export uses the rendered right-side card output.

Admin training flow:
1. Admin creates a draft carrier/product profile.
2. Admin uploads a real sample illustration PDF, not a blank template.
3. Backend extracts PDF text/layout.
4. OpenAI proposes mappings using structured output.
5. Admin reviews detected MANLE fields, values, evidence, confidence, strategy,
   transforms, and required flags.
6. Admin can accept, edit, remap, or ignore mappings.
7. Admin tests the profile against additional sample PDFs.
8. Admin publishes the profile version.
9. Published profile becomes available to generator runtime.

Planned database tables:
- `illustration_profiles`: carrier/product identity, product type, status.
- `illustration_profile_versions`: draft/published versioned configs.
- `illustration_training_examples`: sample PDF metadata and corrected outputs.
- `illustration_extraction_runs`: AI/parser run logs, confidence, errors.
- `illustration_profile_fingerprints`: carrier/product/form/version markers.
- `illustration_profile_field_mappings`: approved field mappings.
- `illustration_profile_projection_mappings`: cash value/death benefit
  projection rules.

Planned API endpoints:
- `GET /api/admin/illustration-profiles`
- `POST /api/admin/illustration-profiles`
- `GET /api/admin/illustration-profiles/:id`
- `POST /api/admin/illustration-profiles/:id/train`
- `PATCH /api/admin/illustration-profiles/:id/examples/:exampleId`
- `POST /api/admin/illustration-profiles/:id/test`
- `POST /api/admin/illustration-profiles/:id/publish`
- `POST /api/illustrations/extract`

Important findings:
- `fe/src/pdf.ts` currently owns local filename/PDF parsing and `handlePdfUpload`.
- `fe/src/render.ts` renders form/state into both IUL and Term Life cards.
- Current parser works for the Cindy Transamerica FFIUL sample and extracts
  name, age, gender, state, risk, face amount, premium, pay years, agent, and
  70 tabular rows.
- Current parser does not fully support the Lauren National Life/Life Insurance
  Company of the Southwest FlexLife sample. It only extracts name and product
  type. Raw PDF text contains useful values such as `Female 28`,
  `State: Texas`, `Initial Premium: $637.00 Monthly`, `Death Protection
  $1,000,000`, and projected cash values, but the current hardcoded parser does
  not map those formats.
- Production design must support both detailed tabular projection rows and
  summary projection blocks such as attained-age/value pairs.

Files changed:
- `current-state.md`: added this implementation handoff and production plan.
- `api/db/migrations/012_illustration_profiles.sql`: added additive profile
  storage schema for illustration profile training and runtime extraction.
- `api/src/types/illustration.ts`: added normalized extract contracts, mapping
  contracts, admin training/runtime response contracts, PDF layout contracts,
  and validation helpers.
- `api/src/services/illustrations.ts`: added profile list/detail/create/update,
  draft/publish version helpers, mapping loaders, training example storage, and
  extraction run storage/update/list helpers.
- `api/src/services/pdfExtraction.ts`: added backend PDF.js text/layout
  extraction with SHA-256, page text, line groups, and positioned text items.
- `api/src/services/illustrationMatching.ts`: added deterministic published
  profile fingerprint matching with required/non-carrier fingerprint guards and
  blocked runtime statuses.
- `api/src/services/openaiIllustrationExtraction.ts`: added admin-training-only
  OpenAI Responses API Structured Outputs service with mapping proposal schema,
  retry handling, output normalization, and validation.
- `api/src/index.ts`: added admin-only profile list/create/detail routes for
  illustration profile workflows, plus train/correction/test/publish routes.
- `api/src/index.ts`: added `POST /api/illustrations/extract` for runtime PDF
  extraction using published profiles only.
- `api/src/services/illustrations.ts`: added training example correction,
  mapping replacement, publish validation, and mapping/fingerprint persistence
  helpers.
- `api/src/services/illustrationRuntimeExtraction.ts`: added runtime PDF
  extraction, published profile matching, deterministic mapping application,
  validation, blocked response handling, and runtime extraction run logging.
- `admin/src/api/client.ts`: added typed illustration profile contracts and
  API methods for list/create/detail/train/correct/test/publish workflows.
- `admin/src/App.tsx`: wired the illustration profiles view into lazy routing
  and admin data loading.
- `admin/src/adminTypes.ts`: added illustration profile state to admin data and
  view routing types.
- `admin/src/viewConfig.ts`: added the sidebar/topbar metadata for
  illustration profiles.
- `admin/src/views/IllustrationProfilesView.tsx`: added profile list, search,
  create, detail, train/test upload, mapping review/edit, save approval, and
  publish controls.
- `admin/src/views/IllustrationProfilesView.tsx`: added saved profile detail
  sections for versions, training examples, fingerprints, field mappings, and
  projection mappings so admins can reopen a profile and inspect persisted
  training details.
- `admin/src/views/IllustrationProfilesView.tsx`: added upload-to-upsert form
  for profile creation from a PDF before training.
- `admin/src/api/client.ts`: added typed upload-to-upsert API method.
- `admin/src/adminShared.tsx`: allowed wide admin dialogs for dense review
  tables.
- `admin/src/views/options.ts`: added product type select options for
  illustration profiles.
- `admin/src/styles.css`: added illustration review workbench, wide dialog,
  mapping table, evidence, and low-confidence row styles.
- `admin/src/styles.css`: added saved profile detail table, JSON preview, and
  collapsible inventory section styles.
- `admin/AGENT_DIRECTORY.md`: documented the new admin client methods and
  illustration UI workflows.
- `admin/AGENT_DIRECTORY.md`: documented saved profile detail tables in the
  illustration profile detail dialog.
- `fe/src/pdf.ts`: changed generator PDF uploads to call
  `POST /api/illustrations/extract`, map successful `IllustrationExtract`
  responses into the existing autofill flow, and block unsupported/needs-review
  responses without overwriting card data.
- `fe/src/pdf.ts`: maps normalized IUL projection rows into
  `state.actualCSV`, `state.actualPVMap`, `state.actualDBMap`, and
  `state.ages`; Term uploads keep Term fields separate and clear stale IUL
  projection cache.
- `fe/AGENT_DIRECTORY.md`: documented the runtime extraction API touchpoint and
  upload behavior.
- `compose.yaml`: passes `OPENAI_*` extractor variables into the local API
  container so Admin training can use the configured backend key.
- `compose.prod.yaml`: passes `OPENAI_*` extractor variables into the
  production API container.
- `scripts/production/prod.env.example`: documents production OpenAI extractor
  variables.
- `api/db/migrations/012_illustration_profiles.sql`: removed raw
  `begin`/`commit` wrapper so the existing Bun SQL migration runner can apply
  the migration.
- `api/src/services/illustrations.ts`: casts JSON payload parameters to
  `jsonb` so selectors, mappings, evidence, extracts, and run metadata persist
  as objects instead of JSON strings.
- `api/src/services/illustrations.ts`: added PDF identity extraction and
  `upsertIllustrationProfileFromPdf` so Admin can upload a PDF, detect
  carrier/product/product type, and create or open the matching profile.
- `api/src/index.ts`: added
  `POST /api/admin/illustration-profiles/upsert-from-pdf`.
- `api/src/types/illustration.ts`: added profile identity extract and
  upload-to-upsert response contracts.
- `api/src/services/pdfExtraction.ts`: captures `fileSizeBytes` before PDF.js
  parsing so admin training examples do not persist a detached buffer size of
  `0`.
- `api/db/migrations/013_illustration_training_example_needs_review.sql`:
  expands training example status to `needs_review`, repairs existing stuck
  training rows with completed runs, and converts JSONB values that were stored
  as JSON strings back to objects/arrays.
- `api/src/index.ts`: marks training examples as `needs_review` or `rejected`
  when the OpenAI training request completes, and stores
  `metadata.reviewProposal` for future review reloads.
- `api/src/services/illustrations.ts`: accepts the `needs_review` training
  example status, returns recent extraction runs with profile detail, and casts
  JSONB update payloads before persistence.
- `admin/src/views/IllustrationProfilesView.tsx`: adds a Review action on saved
  training examples when a completed run has a persisted proposal, rebuilding
  the editable review panel from saved run data. Legacy `needs_review` rows
  without saved proposals show an Upload again action that scrolls back to the
  Training PDF upload form.
- `admin/src/api/client.ts`: includes profile detail runs in the Admin API
  contract.
- `api/src/services/admin.ts`, `api/src/services/email.ts`, and
  `api/src/services/paddle.ts`: cast JSONB writes for audit metadata,
  entitlement values, email variables, Paddle metadata, and webhook payloads.
- `current-state.md`: marked Slice 15 and Slice 16 complete, recorded final
  sample-PDF runtime verification, validation results, skipped checks, risks,
  and follow-up next steps.
- `api/src/config.ts`: added `OPENAI_*` extractor configuration defaults.
- `.env.example`: documented OpenAI extractor variables.
- `api/package.json`: added `pdfjs-dist` dependency for backend extraction.
- `api/bun.lock`: recorded the API dependency lockfile.
- `api/AGENT_DIRECTORY.md`: documented the new migration, type contracts, and
  service/table ownership.

Validation run:
- `git status --short`: clean before this file was created.
- Sample parser verification was previously run with temporary Bun/PDF.js
  harnesses for the Cindy and Lauren sample PDFs; those temporary files were
  deleted.
- `cd api && bun run build`: passed after adding the migration.
- `cd api && bun build src/types/illustration.ts --target bun --outdir
  /private/tmp/manle-api-contract-build`: passed after adding Slice 2
  contracts.
- `cd api && bun run build`: passed after adding Slice 2 contracts.
- `cd api && bun build src/services/illustrations.ts --target bun --outdir
  /private/tmp/manle-api-illustrations-build`: passed after adding Slice 3
  service skeletons.
- `cd api && bun run build`: passed after adding Slice 3 service skeletons.
- `cd api && bun install`: passed after adding `pdfjs-dist` (required
  escalated sandbox permission because Bun could not write its temp/cache files
  in the default sandbox).
- `cd api && bun build src/services/pdfExtraction.ts --target bun --outdir
  /private/tmp/manle-api-pdf-extraction-build`: passed after adding Slice 4
  PDF extraction.
- `cd api && bun --eval ...extractPdfTextLayout(...)`: passed on Cindy
  Transamerica FFIUL and Lauren FlexLife sample PDFs with `maxPages: 3`,
  returning file hash, page count, extracted page count, and first page text.
- `cd api && bun run build`: passed after adding Slice 4 PDF extraction.
- `cd api && bun build src/services/illustrationMatching.ts --target bun
  --outdir /private/tmp/manle-api-matching-build`: passed after adding Slice 5
  matcher.
- `cd api && bun run build`: passed after adding Slice 5 matcher.
- `cd api && bun build src/services/openaiIllustrationExtraction.ts --target
  bun --outdir /private/tmp/manle-api-openai-extraction-build`: passed after
  adding Slice 6 OpenAI training service.
- `cd api && bun run build`: passed after adding Slice 6 OpenAI training
  service.
- `cd api && bun run build`: passed after adding Slice 7 admin profile CRUD
  routes.
- `cd api && bun build src/services/illustrations.ts --target bun --outdir
  /private/tmp/manle-api-illustrations-build`: passed after adding Slice 8
  correction/mapping helpers.
- `cd api && bun run build`: passed after adding Slice 8 admin
  train/test/publish routes.
- `cd admin && bun run build`: passed after adding Slice 9 admin API client
  types and methods.
- `cd admin && bun run build`: passed after adding Slice 10 admin profile
  list/create/detail UI.
- `cd admin && bun run build`: passed after adding Slice 11 admin mapping
  review/edit UI.
- `cd api && bun run build`: passed after adding Slice 12 generator runtime
  extraction API.
- `cd fe && bun run build`: passed after adding Slice 13 generator upload flow
  runtime API integration.
- `cd fe && bun run build`: passed after adding Slice 14 normalized render
  mapping.
- `docker compose --env-file .env -f compose.yaml config --quiet`: passed
  after adding OpenAI env wiring.
- `IMAGE_OWNER=local IMAGE_TAG=slice15 FE_ORIGIN=https://fe.example
  ADMIN_ORIGIN=https://admin.example DATABASE_URL=postgres://... docker compose
  --env-file scripts/production/prod.env.example -f compose.prod.yaml config
  --quiet`: passed after adding production OpenAI env wiring.
- `make up`: passed after Docker escalation; local Postgres/Redis/API/FE/Admin
  stack started.
- `curl http://127.0.0.1:8790/health`: passed after migration fix.
- Temporary Slice 15 seed harness published local Cindy and Lauren regression
  profiles:
  - Cindy profile `04699c8f-4f15-4fa1-b6e0-e3dd0dbc7548`, version
    `1b98eb2f-a19a-4bf5-8791-6ebef12f007f`, SHA-256
    `cef71684c591024a78d4570de167c0fe17e952a4060a6368853d9d49a3870a2e`.
  - Lauren profile `48c08102-2af1-40b0-a00e-acf238d744dc`, version
    `2bddcaf4-43ba-49f2-8153-c91a9f09ecc9`, SHA-256
    `615f69c603976b635f829cbc307dc47e3122e730f8b9c1b32d43a7f9902fe84c`.
- Postgres `jsonb_typeof(source_selector)` verification confirmed remapped
  profile selectors now persist as JSON objects instead of JSON strings.
- Cindy runtime `POST /api/illustrations/extract` returned `succeeded` with
  carrier `Transamerica Life Insurance Company`, product
  `Transamerica Financial Foundation IUL II`, client `Cindy Ngoc Phuong`, age
  `51`, risk class `Preferred`, face amount `220000`, monthly premium `300`,
  agent `Ms. Regina Dang`, and 12 projection rows.
- Lauren runtime `POST /api/illustrations/extract` returned `succeeded` with
  carrier `Life Insurance Company of the Southwest`, product `FlexLife`, client
  `Lauren Nguyen`, age `28`, risk class `Select Non-Tobacco`, state `Texas`,
  face amount `1000000`, monthly premium `637`, pay years `20`, agent
  `Tri Ngo`, and 4 projection rows.
- Unsupported Nationwide IUL sample returned `unsupported_profile` with message
  `Profile matching requires at least one approved non-carrier fingerprint.`
- `cd api && bun run build`: passed after Slice 16 handoff update.
- `cd admin && bun run build`: passed after Slice 16 handoff update.
- `cd fe && bun run build`: passed after Slice 16 handoff update.
- `docker compose --env-file .env -f compose.yaml config --quiet`: passed
  after Slice 16 handoff update.
- Production compose `config --quiet` with placeholder required env: passed
  after Slice 16 handoff update.
- `git diff --check`: passed after Slice 16 handoff update.
- `git status --short --branch`: final Slice 16 status showed expected modified
  source/config/state files only.
- `cd admin && bun run build`: passed after adding saved profile detail tables.
- `cd api && bun run build`: passed after adding upload-to-upsert profile flow.
- `cd admin && bun run build`: passed after adding upload-to-upsert profile
  flow.
- Focused `bun --eval` identity extraction check passed for Cindy
  Transamerica, Lauren FlexLife, and Nationwide Indexed UL Accumulator III PDFs.
- Focused `bun --eval` PDF extraction regression check passed for the
  Nationwide Indexed UL Accumulator III attachment; extractor now returns
  `fileSizeBytes: 1438086` instead of `0`.
- `cd api && bun run build`: passed after preserving uploaded PDF file size
  before PDF.js parsing.
- `psql ... -f api/db/migrations/013_illustration_training_example_needs_review.sql`:
  passed; updated the current Nationwide training example from `training` to
  `needs_review`.
- `DATABASE_URL=postgres://... bun run db:migrate`: passed with escalated
  sandbox permission; the migration runner applied all 13 local migrations.
- Postgres verification confirmed the current Nationwide run JSONB columns are
  `object` values, not JSON strings.
- `cd api && bun run build`: passed after the `needs_review` status and JSONB
  update fixes.
- `cd admin && bun run build`: passed after adding the `needs_review` admin
  type.
- `DATABASE_URL=postgres://... bun --eval ...getIllustrationProfile(...)`:
  passed with escalated sandbox permission; confirmed current Nationwide detail
  returns one `needs_review` example and one succeeded run, but that older run
  has no persisted `reviewProposal`.
- `cd api && bun run build`: passed after adding profile detail runs and
  persisted training review proposals.
- `cd admin && bun run build`: passed after adding the saved example Review
  action.
- In-app browser opened `http://localhost:5176/`, but UI verification could not
  continue because that browser session was not logged in to Admin.

Validation skipped:
- Browser QA against an authenticated Admin modal was not completed because the
  in-app browser session was unauthenticated.
- Export PDF/PNG/JPG checks were not run because browser/export QA was not
  explicitly requested.

Risks:
- Parser/profile matching must avoid false positives between products from the
  same carrier.
- Admin profile publish validation must prevent invented or low-confidence
  insurance values from reaching generator runtime.
- PDF examples contain PII; do not log full raw PDF text unnecessarily. Store
  limited evidence snippets and audit metadata.
- FE/API/Admin contracts must be updated together once implementation starts.

Implementation progress ledger:
- [x] Slice 0: Capture requirements and production plan in this file.
- [x] Slice 1: Add DB migration for profile storage.
- [x] Slice 2: Add API/domain contracts for normalized extraction.
- [x] Slice 3: Add profile repositories and service skeletons.
- [x] Slice 4: Add backend PDF text/layout extraction service.
- [x] Slice 5: Add deterministic profile fingerprint matching.
- [x] Slice 6: Add OpenAI structured extraction service for admin training.
- [x] Slice 7: Add admin profile CRUD APIs.
- [x] Slice 8: Add admin train/test/publish APIs.
- [x] Slice 9: Add admin API client types and methods.
- [x] Slice 10: Add admin profile list/create/detail UI.
- [x] Slice 11: Add admin mapping review/edit UI.
- [x] Slice 12: Add generator runtime extraction API.
- [x] Slice 13: Update generator upload flow to call backend extraction.
- [x] Slice 14: Render normalized IUL/Term extracts into the right-side card.
- [x] Slice 15: Regression verify with Cindy and Lauren PDFs.
- [x] Slice 16: Final build validation and handoff update.

Next steps:
- Commit and push the current working-tree changes when requested.
- Run browser QA for generator upload/card rendering only if requested.
- Run export PDF/PNG/JPG checks only if requested.
- Keep the local Docker stack running only as long as runtime verification is
  needed; stop it with `make stop` when finished.

Slice details:

## Slice 1: DB migration for profile storage
Labels: area:db, area:api, risk:data, risk:contract, type:feature

Goal:
Add production Postgres tables for illustration profiles, profile versions,
training examples, extraction runs, fingerprints, field mappings, and projection
mappings.

Entry points:
- `api/AGENT_DIRECTORY.md`: database schema, migrations.
- `api/db/migrations/**`: migration source of truth.

Scope:
- New additive SQL migration under `api/db/migrations/**`.
- Include indexes and foreign keys for profile/version/example lookups.
- Store timestamps as `timestamptz`.

Out of scope:
- API routes, admin UI, OpenAI calls, generator upload integration.

Acceptance:
- Migration is additive and deterministic.
- Published/draft versioning can be represented.
- Training examples and runs can link to profile versions.
- No raw OpenAI secrets or API keys are stored in these tables.

Validation:
- `cd api && bun run build`
- If a dev database is available: `cd api && bun run db:migrate`

Dependencies:
- None.

## Slice 2: API/domain contracts for normalized extraction
Labels: area:api, area:pdf, risk:contract, risk:parser, type:feature

Goal:
Define TypeScript contracts for `IllustrationExtract`, field mappings,
projection mappings, extraction status responses, and admin training payloads.

Entry points:
- `api/src/types/**`
- `api/src/services/**`
- `fe/src/pdf.ts` for eventual consumer contract awareness.
- `admin/src/api/client.ts` for eventual admin client shape.

Scope:
- Add contract/types module only.
- Include runtime validation helpers if the project already uses a local
  validation pattern; otherwise keep explicit typed guard functions.

Out of scope:
- Routes and UI consumers.

Acceptance:
- Contracts cover IUL and Term.
- Evidence and confidence are first-class.
- Unsupported/no-profile/needs-review statuses are explicit.

Validation:
- `cd api && bun run build`

Dependencies:
- Slice 1 preferred, but contract file can be reviewed independently.

Implemented:
- Added `api/src/types/illustration.ts` with `IllustrationExtract`,
  `IllustrationRuntimeExtractResponse`, admin training proposal/profile mapping
  contracts, PDF extraction result contracts, confidence/evidence types, and
  `validateIllustrationExtract`.
- Explicit runtime statuses now distinguish `unsupported_profile`,
  `no_published_profile`, `needs_review`, and `extraction_failed`.
- Added `extractionRunStatusForRuntimeStatus` to map runtime statuses back to
  the `illustration_extraction_runs.status` storage statuses.

Validation:
- `cd api && bun build src/types/illustration.ts --target bun --outdir
  /private/tmp/manle-api-contract-build`: passed.
- `cd api && bun run build`: passed.

## Slice 3: Profile repositories and service skeletons
Labels: area:api, area:db, risk:contract, type:feature

Goal:
Add repository/service functions for creating profiles, reading profile detail,
listing profiles, storing training examples/runs, and loading published profile
versions.

Entry points:
- `api/src/db/client.ts`
- `api/src/services/admin.ts` patterns for repositories/audit.
- New service/repository module for illustration profiles.

Scope:
- Parameterized SQL only.
- No route exposure yet except helper functions if needed.

Out of scope:
- OpenAI, PDF parsing, admin UI.

Acceptance:
- Service can create/list/read profile records.
- Service can mark/load published profile versions.
- Admin mutations are ready to be audited once routes are added.

Validation:
- `cd api && bun run build`

Dependencies:
- Slice 1.

Implemented:
- Added `api/src/services/illustrations.ts` with parameterized Postgres helpers
  for profile list/detail/create/update, draft version creation, version
  publish state changes, published version loading, mapping loaders, training
  example storage, and extraction run storage/update/list.
- Admin-facing mutations are wired to `audit`; no routes are exposed yet.
- Succeeded extraction run storage validates `IllustrationExtract` before
  persisting normalized output.

Validation:
- `cd api && bun build src/services/illustrations.ts --target bun --outdir
  /private/tmp/manle-api-illustrations-build`: passed.
- `cd api && bun run build`: passed.

## Slice 4: Backend PDF text/layout extraction service
Labels: area:api, area:pdf, risk:parser, type:feature

Goal:
Move PDF text/layout extraction to backend service so admin training and runtime
upload share the same PDF parsing substrate.

Entry points:
- `fe/src/pdf.ts`: current extraction behavior for reference.
- `fe/src/runtime.ts`: PDF.js dependency behavior for reference.
- `api/package.json`: dependency management.

Scope:
- Add backend PDF extraction module.
- Return pages, text items, line groups, page text, document hash, and metadata.
- Keep raw PDF text logs disabled by default.

Out of scope:
- AI extraction and mapping application.

Acceptance:
- Backend can extract text from Cindy and Lauren sample PDFs.
- Service exposes enough layout/evidence data for mapping and admin review.

Validation:
- `cd api && bun run build`
- Focused local script/test if added.

Dependencies:
- Slice 2.

Implemented:
- Added `api/src/services/pdfExtraction.ts` with `extractPdfTextLayout` for
  File/Blob/ArrayBuffer/Uint8Array inputs.
- Extraction returns document SHA-256, file size, total page count, combined
  text, per-page text, grouped line objects, positioned text items, and metadata
  for extracted page count/max page limit.
- Added `pdfjs-dist@3.11.174` to the API package, matching the FE dependency.
- Uses runtime dynamic import of `pdfjs-dist/build/pdf.js` so API builds do not
  bundle optional PDF.js rendering dependencies.

Validation:
- `cd api && bun install`: passed.
- `cd api && bun build src/services/pdfExtraction.ts --target bun --outdir
  /private/tmp/manle-api-pdf-extraction-build`: passed.
- `cd api && bun --eval ...extractPdfTextLayout(...)`: passed on Cindy
  Transamerica FFIUL and Lauren FlexLife sample PDFs with `maxPages: 3`.
- `cd api && bun run build`: passed.

## Slice 5: Deterministic profile fingerprint matching
Labels: area:api, area:pdf, risk:parser, risk:contract, type:feature

Goal:
Match uploaded PDFs to published profiles using approved fingerprints before
any runtime extraction/render is allowed.

Entry points:
- Profile fingerprint tables from Slice 1.
- PDF extraction service from Slice 4.

Scope:
- Implement carrier/product/form/version marker matching.
- Return match score and evidence.
- Avoid matching only by carrier.

Out of scope:
- OpenAI matching fallback.

Acceptance:
- No published profile means `unsupported_profile`.
- Low-confidence match means no render.
- Same carrier/different product can be distinguished by product/form markers.

Validation:
- `cd api && bun run build`

Dependencies:
- Slices 1, 3, 4.

Implemented:
- Added `api/src/services/illustrationMatching.ts` with
  `matchPublishedIllustrationProfile`.
- Matcher loads published profile details, evaluates approved fingerprints using
  `contains`, `equals`, `regex`, or `normalized_contains`, returns evidence
  snippets, computes weighted score, and applies the published
  `minMatchScore`.
- Runtime matching is blocked unless all required fingerprints match and at
  least one non-carrier fingerprint matches, preventing carrier-only false
  positives.
- Blocked statuses distinguish `no_published_profile`, `unsupported_profile`,
  and `low_match_confidence`.

Validation:
- `cd api && bun build src/services/illustrationMatching.ts --target bun
  --outdir /private/tmp/manle-api-matching-build`: passed.
- `cd api && bun run build`: passed.
- Integration matching against persisted profiles was not run because the local
  database migration was not applied.

## Slice 6: OpenAI structured extraction service for admin training
Labels: area:api, area:pdf, risk:parser, type:feature

Goal:
Add backend OpenAI service that proposes mappings and normalized sample output
for admin training only.

Entry points:
- `api/src/config.ts`
- New illustration extraction service module.
- OpenAI config from this file.

Scope:
- Read env vars:
  `OPENAI_API_KEY`, `OPENAI_EXTRACTOR_FAST_MODEL`,
  `OPENAI_EXTRACTOR_MODEL`, `OPENAI_EXTRACTOR_RETRY_MODEL`,
  `OPENAI_EXTRACTOR_ALLOW_RETRY`, `OPENAI_EXTRACTOR_ALLOW_ESCALATION`.
- Use Structured Outputs.
- Include validation and retry with `gpt-4.1-mini` when enabled.

Out of scope:
- Runtime generator OpenAI calls.

Acceptance:
- Missing API key produces a clear admin-only configuration error.
- Output must pass schema/business validation before becoming a training draft.
- Evidence snippets are stored; raw full PDF text is not logged.

Validation:
- `cd api && bun run build`
- Do not call real OpenAI in build validation.

Dependencies:
- Slices 2, 4.

Implemented:
- Added `api/src/services/openaiIllustrationExtraction.ts` with
  `generateIllustrationTrainingProposal` for admin training only.
- The service calls the OpenAI Responses API using Structured Outputs
  (`text.format` JSON schema), builds a normalized extract plus fingerprints,
  field mappings, projection mappings, evidence, confidence, and validation
  issues.
- Missing `OPENAI_API_KEY` fails with an admin-only
  `openai_not_configured` error.
- Retry uses `OPENAI_EXTRACTOR_RETRY_MODEL` when
  `OPENAI_EXTRACTOR_ALLOW_RETRY=true`.
- The service sends bounded PDF text excerpts to OpenAI and returns limited
  evidence snippets; it does not log or store full raw PDF text.
- Added `OPENAI_*` config reads in `api/src/config.ts`.

Validation:
- `cd api && bun build src/services/openaiIllustrationExtraction.ts --target
  bun --outdir /private/tmp/manle-api-openai-extraction-build`: passed.
- `cd api && bun run build`: passed.
- Live OpenAI API call was intentionally not run during build validation.

## Slice 7: Admin profile CRUD APIs
Labels: area:api, area:admin, area:db, risk:auth, risk:contract, type:feature

Goal:
Expose admin-only APIs to list, create, and inspect illustration profiles.

Entry points:
- `api/src/index.ts`: route branches.
- `api/src/services/auth.ts`: `requireAdmin`.
- Profile service from Slice 3.

Scope:
- `GET /api/admin/illustration-profiles`
- `POST /api/admin/illustration-profiles`
- `GET /api/admin/illustration-profiles/:id`
- Audit admin mutations.

Out of scope:
- Train/test/publish routes.

Acceptance:
- Routes require admin role.
- Responses use explicit typed contract.
- Mutations write audit logs.

Validation:
- `cd api && bun run build`

Dependencies:
- Slices 1, 2, 3.

Implemented:
- Added admin-only routes in `api/src/index.ts`:
  - `GET /api/admin/illustration-profiles?search=`
  - `POST /api/admin/illustration-profiles`
  - `GET /api/admin/illustration-profiles/:id`
- Routes are reached only after `requireAdmin(request)`.
- Create route uses `createIllustrationProfile`, which creates the initial
  draft profile version and audits `illustration_profile.create`.
- Detail route returns profile versions, mappings, fingerprints, and training
  examples from `getIllustrationProfile`.

Validation:
- `cd api && bun run build`: passed.

## Slice 8: Admin train/test/publish APIs
Labels: area:api, area:admin, area:pdf, risk:auth, risk:parser, risk:contract, type:feature

Goal:
Expose admin-only train, correction, test, and publish endpoints.

Entry points:
- `api/src/index.ts`
- Profile repository/service.
- PDF extraction service.
- OpenAI extraction service.

Scope:
- `POST /api/admin/illustration-profiles/:id/train`
- `PATCH /api/admin/illustration-profiles/:id/examples/:exampleId`
- `POST /api/admin/illustration-profiles/:id/test`
- `POST /api/admin/illustration-profiles/:id/publish`
- Store extraction runs and admin-corrected output.

Out of scope:
- Admin React UI.

Acceptance:
- Publish requires required mappings to pass validation.
- Publish creates/marks a version as published.
- Test endpoint can run extraction against an uploaded sample without publishing.
- All mutations audited.

Validation:
- `cd api && bun run build`

Dependencies:
- Slices 4, 5, 6, 7.

Implemented:
- Added admin-only routes in `api/src/index.ts`:
  - `POST /api/admin/illustration-profiles/:id/train`
  - `PATCH /api/admin/illustration-profiles/:id/examples/:exampleId`
  - `POST /api/admin/illustration-profiles/:id/test`
  - `POST /api/admin/illustration-profiles/:id/publish`
- Train/test routes accept multipart `file` or `pdf`, extract backend PDF
  text/layout, record `illustration_extraction_runs`, and call
  `generateIllustrationTrainingProposal`.
- Train route stores/upserts an `illustration_training_examples` row; test route
  does not store a training example.
- Correction route stores admin-corrected output/evidence and optionally
  replaces draft fingerprints, field mappings, and projection mappings.
- Publish route publishes the supplied `profileVersionId` or current draft only
  after required field mappings and required carrier/non-carrier fingerprints
  pass validation.
- Admin mutations are audited.

Validation:
- `cd api && bun build src/services/illustrations.ts --target bun --outdir
  /private/tmp/manle-api-illustrations-build`: passed.
- `cd api && bun run build`: passed.
- Live DB/OpenAI endpoint testing was not run during build validation.

## Slice 9: Admin API client types and methods
Labels: area:admin, risk:contract, type:feature

Goal:
Add typed admin API client support for illustration profile workflows.

Entry points:
- `admin/src/api/client.ts`
- `admin/src/adminTypes.ts`

Scope:
- Add types matching API responses.
- Add client methods for list/create/detail/train/correct/test/publish.

Out of scope:
- UI screens.

Acceptance:
- Admin build compiles against backend contract types.
- Client handles API errors consistently with existing admin UI.

Validation:
- `cd admin && bun run build`

Dependencies:
- Slices 7, 8.

Implemented:
- Added illustration profile response/request types to
  `admin/src/api/client.ts`, including profile summaries/details, versions,
  fingerprints, mappings, training examples, extraction runs, training
  proposals, and correction payloads.
- Added client methods:
  - `illustrationProfiles`
  - `createIllustrationProfile`
  - `illustrationProfile`
  - `trainIllustrationProfile`
  - `correctIllustrationTrainingExample`
  - `testIllustrationProfile`
  - `publishIllustrationProfile`
- Updated admin request handling so `FormData` upload requests do not force
  `Content-Type: application/json`.

Validation:
- `cd admin && bun run build`: passed.

## Slice 10: Admin profile list/create/detail UI
Labels: area:admin, risk:contract, type:feature

Goal:
Add operational admin screens for listing profiles, creating draft profiles, and
opening profile details.

Entry points:
- `admin/src/App.tsx`
- `admin/src/viewConfig.ts`
- `admin/src/views/**`
- `admin/src/styles.css`

Scope:
- Add sidebar/view entry for illustration profiles.
- Add dense table and compact create form.
- Show status, carrier, product, product type, active version, updated time.

Out of scope:
- Mapping review table.

Acceptance:
- Admin can create and inspect draft profiles.
- Loading/error/empty states are present.

Validation:
- `cd admin && bun run build`

Dependencies:
- Slice 9.

Implemented:
- Added `IllustrationProfilesView` with search, sortable profile table, empty
  state, compact create dialog, and detail dialog.
- Wired `illustrations` into the admin view union, sidebar metadata, lazy route
  rendering, and `loadAll()` data loading.
- Detail view shows status, active version, draft/published version summary,
  timestamps, notes, and inventory counts for versions, examples,
  fingerprints, field mappings, and projection mappings.

Validation:
- `cd admin && bun run build`: passed.

## Slice 11: Admin mapping review/edit UI
Labels: area:admin, area:pdf, risk:parser, risk:contract, type:feature

Goal:
Let admin upload sample PDFs, review proposed mappings, edit mappings/sample
output, test, and publish.

Entry points:
- Admin illustration profile view from Slice 10.
- `admin/src/styles.css`

Scope:
- Upload sample PDF.
- Mapping review table with MANLE field, detected value, evidence, confidence,
  strategy, transform, required flag, and action.
- Edit/remap/ignore mappings.
- Test sample and publish controls.

Out of scope:
- Generator runtime UI.

Acceptance:
- Admin approval is required before publish.
- Low-confidence fields are visible.
- Evidence page/text is visible without exposing full raw PDF text.

Validation:
- `cd admin && bun run build`

Dependencies:
- Slices 8, 10.

Implemented:
- Expanded `IllustrationProfilesView` into a profile detail workbench with
  training PDF upload, test PDF upload, optional fast model and max-page
  controls, and backend error display.
- Added mapping review/edit tables for fingerprints, field mappings, and
  projection mappings with inline edit, ignore, restore, confidence, required,
  strategy, selector, transform, and evidence review controls.
- Added corrected sample output JSON editing and `Save reviewed mappings`,
  which calls `api.correctIllustrationTrainingExample` to persist admin
  approval to the draft profile version.
- Publish controls now require saved fingerprints and field mappings before the
  publish button enables; backend publish validation remains authoritative.
- Evidence display is limited to stored page/text snippets from the proposal,
  not full raw PDF text.

Validation:
- `cd admin && bun run build`: passed.

## Slice 12: Generator runtime extraction API
Labels: area:api, area:pdf, risk:parser, risk:contract, type:feature

Goal:
Add customer/runtime endpoint that extracts only with published profiles.

Entry points:
- `api/src/index.ts`
- Profile matching and mapping services.

Scope:
- `POST /api/illustrations/extract`
- Upload PDF, extract text/layout, match published profile, apply mappings,
  validate normalized output.

Out of scope:
- FE upload integration.
- Runtime OpenAI calls.

Acceptance:
- No profile returns `unsupported_profile`.
- Validation failure returns `needs_review` or `extraction_failed`.
- Success returns `IllustrationExtract`.

Validation:
- `cd api && bun run build`

Dependencies:
- Slices 5, 8.

Implemented:
- Added `api/src/services/illustrationRuntimeExtraction.ts` with
  `extractRuntimeIllustration` for runtime-only extraction.
- Added `POST /api/illustrations/extract` in `api/src/index.ts`; it accepts a
  multipart `file` or `pdf`, optional `maxPages`, optional `productType`, and
  uses optional current-user identity only for run ownership.
- Runtime extraction parses PDF text/layout, matches only active published
  profile versions, applies approved deterministic mappings, validates the
  normalized extract, and records `runtime_extract` rows.
- Runtime does not call OpenAI. It returns blocked statuses for no published
  profile, unsupported/low-confidence matches, low extraction confidence,
  validation failures, invalid PDFs, and parse failures.
- Evidence in responses and run logs is limited to approved snippets and mapped
  field snippets, not full raw PDF text.

Validation:
- `cd api && bun run build`: passed.

## Slice 13: Generator upload flow calls backend extraction
Labels: area:fe, area:api, area:pdf, risk:contract, risk:parser, type:feature

Goal:
Update generator upload flow so customer uploads call the backend runtime
extract endpoint instead of relying only on local hardcoded parser behavior.

Entry points:
- `fe/src/pdf.ts`
- `fe/src/account.ts` API base pattern if needed.
- `fe/src/template.html` upload messages.

Scope:
- Add API call for `POST /api/illustrations/extract`.
- Preserve upload-zone loading/success/error UX.
- Show unsupported/profile-update errors clearly.

Out of scope:
- Admin training UI.

Acceptance:
- Unsupported profiles do not render or overwrite existing card data.
- Successful extract applies normalized data and renders.

Validation:
- `cd fe && bun run build`

Dependencies:
- Slice 12.

Implemented:
- Updated `fe/src/pdf.ts` so `handlePdfUpload` calls
  `POST /api/illustrations/extract` with multipart `file` and `productType`
  from the upload zone.
- Added runtime response handling that maps a successful `IllustrationExtract`
  into the existing `applyExtracted` flow, including shared client/risk fields,
  IUL/Term policy fields, agent fields, and available projection rows.
- Blocked statuses such as no published profile, unsupported profile,
  low-confidence match, needs-review/profile-update, invalid PDF, and parse
  failure show upload-zone errors and do not overwrite existing form/card data.
- Existing local parser helpers remain in place for now, but generator upload
  submission is backend-runtime-first.

Validation:
- `cd fe && bun run build`: passed.

## Slice 14: Render normalized IUL/Term extracts into right-side card
Labels: area:fe, area:pdf, area:export, risk:visual, risk:parser, type:feature

Goal:
Map `IllustrationExtract` into existing form/state/render paths so the
right-side card is the final output for export.

Entry points:
- `fe/src/core.ts`
- `fe/src/render.ts`
- `fe/src/pdf.ts`
- `fe/src/persistence.ts` if new extracted state must persist.

Scope:
- Apply shared client/risk fields.
- Apply IUL policy/projection rows to `state.actualCSV`,
  `state.actualPVMap`, `state.actualDBMap`, and `state.ages`.
- Apply Term fields to `termFaceAmount`, `termMonthlyPrem`, and `termLength`.
- Keep IUL and Term product-specific fields separate.

Out of scope:
- Visual redesign.

Acceptance:
- IUL extracts render cash/projection rows when available.
- Term extracts render term-specific fields.
- Export continues using the rendered card.

Validation:
- `cd fe && bun run build`

Dependencies:
- Slice 13.

Implemented:
- Normalized runtime projection rows now coerce numeric values conservatively,
  support `cashValue` fallback values, and drop invalid rows.
- IUL runtime extracts populate exact CSV/PV/DB maps and replace `state.ages`
  with the extracted projection ages before `renderAgeList()` and `render()`.
- Term runtime extracts continue to fill `termFaceAmount`,
  `termMonthlyPrem`, and `termLength` through `applyExtracted`, without writing
  IUL policy fields.
- Runtime `productType` now takes priority over the upload zone when choosing
  IUL versus Term policy fields, so an IUL PDF dropped in the Term zone still
  fills IUL fields.
- Term uploads and IUL uploads without valid projection rows clear stale
  PDF-derived projection maps.

Validation:
- `cd fe && bun run build`: passed.

## Slice 15: Regression verify with Cindy and Lauren PDFs
Labels: area:pdf, area:fe, area:api, area:admin, risk:parser, risk:visual, type:test

Goal:
Verify the full training/runtime flow using known Cindy and Lauren sample PDFs.

Entry points:
- Cindy PDF under `/Users/khiemnguyen/Works/manle/documents/**`.
- Lauren PDF under `/Users/khiemnguyen/Works/manle/documents/**`.
- Admin train/test APIs and generator runtime extraction API.

Scope:
- Train/publish profiles as needed in local/dev environment.
- Verify Cindy Transamerica FFIUL output.
- Verify Lauren FlexLife output.

Out of scope:
- Broad carrier coverage beyond these two samples.

Acceptance:
- Cindy renders known extracted client/policy/agent/projection values.
- Lauren renders values from FlexLife summary format after profile training.
- Unsupported profiles are blocked.

Validation:
- `cd api && bun run build`
- `cd admin && bun run build`
- `cd fe && bun run build`
- Browser/export QA only if explicitly requested during implementation.

Dependencies:
- Slices 1-14.

Completed:
- Local stack startup initially failed because migration 012 used raw
  `begin`/`commit`; removing the wrapper let API migration complete through the
  existing Bun SQL migration runner.
- Admin training/runtime in Docker would not see `OPENAI_*` despite root `.env`
  being configured; compose wiring is now fixed for local and production.
- Runtime verification exposed JSONB selector persistence as strings when Bun
  SQL received `JSON.stringify(...)` values directly. JSONB writes now cast via
  text before `jsonb`, and the seeded profile selectors verify as JSON objects.
- Local deterministic Cindy/Lauren profiles were seeded and published through
  service functions.
- Cindy runtime extraction returned `succeeded` for the Transamerica FFIUL
  sample with expected client, policy, agent, and projection values.
- Lauren runtime extraction returned `succeeded` for the FlexLife summary sample
  with expected client, policy, agent, and projection values.
- Unsupported Nationwide IUL runtime extraction returned `unsupported_profile`
  and did not match the published Cindy/Lauren profiles.

Validation completed:
- `docker compose --env-file .env -f compose.yaml config --quiet`: passed.
- Production compose `config --quiet` with placeholder required env: passed.
- `make up`: passed after escalation.
- `curl http://127.0.0.1:8790/health`: passed.
- Temporary Slice 15 seed harness: passed for Cindy and Lauren.
- Runtime `POST /api/illustrations/extract`: passed for Cindy and Lauren.
- Runtime `POST /api/illustrations/extract`: passed unsupported-profile block
  for the Nationwide sample.
- `cd api && bun run build`: passed.
- `cd admin && bun run build`: passed.
- `cd fe && bun run build`: passed.
- `git diff --check`: passed.

## Slice 16: Final validation and handoff update
Labels: area:docs, area:api, area:admin, area:fe, risk:contract, type:docs

Goal:
Record final implemented state, commands run, skipped checks, and residual risks.

Entry points:
- `current-state.md`
- `docs/agents/handoff.md`

Scope:
- Update this ledger checkboxes.
- Summarize files changed and validation results.
- Note any follow-up tasks.

Out of scope:
- New feature work.

Acceptance:
- Next agent can continue without rediscovery.
- Current state distinguishes implemented vs planned work.

Validation:
- `git status --short`

Dependencies:
- Update after every completed slice, and again after final validation.

Completed:
- This handoff file now records implemented state, changed files, sample-PDF
  runtime verification, validation commands, skipped browser/export checks, and
  remaining next steps.
- The implementation ledger marks all slices through Slice 16 complete.
- Final git status was reviewed; the remaining modified files are the expected
  API, Docker/env example, and state files.

Validation completed:
- `git status --short --branch`: showed expected modified files only.
- `git diff --check`: passed after the Slice 16 handoff update.
- `docker compose --env-file .env -f compose.yaml config --quiet`: passed
  after the Slice 16 handoff update.
- Production compose `config --quiet` with placeholder required env: passed
  after the Slice 16 handoff update.
- `cd api && bun run build`: passed after the Slice 16 handoff update.
- `cd admin && bun run build`: passed after the Slice 16 handoff update.
- `cd fe && bun run build`: passed after the Slice 16 handoff update.

Progress update rule:
After each slice is completed, update this file before moving on:
- Mark the slice checkbox as `[x]`.
- Add the files changed for that slice.
- Add commands run and pass/fail results.
- Add skipped validation, if any.
- Add blockers or follow-up risks.
- Update the next active slice.
