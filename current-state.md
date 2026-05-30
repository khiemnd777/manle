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
- Admin UI and generator runtime integration have not been started yet.
- Generator runtime must not learn new carriers from customer uploads.
- Generator runtime must only render when a published admin-approved profile
  matches the uploaded PDF.
- Admin training uses OpenAI on the backend to propose mappings, but admin
  review/publish is required before customer uploads can use a profile.
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
- `api/src/services/illustrations.ts`: added training example correction,
  mapping replacement, publish validation, and mapping/fingerprint persistence
  helpers.
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
- `cd api && bun run db:migrate`: attempted, but local Postgres was not
  reachable, so the migration was not applied locally.

Validation skipped:
- Browser QA was not run.
- Export PDF/PNG/JPG checks were not run.
- Local database migration verification was not completed because the dev
  database connection failed.

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
- [ ] Slice 9: Add admin API client types and methods.
- [ ] Slice 10: Add admin profile list/create/detail UI.
- [ ] Slice 11: Add admin mapping review/edit UI.
- [ ] Slice 12: Add generator runtime extraction API.
- [ ] Slice 13: Update generator upload flow to call backend extraction.
- [ ] Slice 14: Render normalized IUL/Term extracts into the right-side card.
- [ ] Slice 15: Regression verify with Cindy and Lauren PDFs.
- [ ] Slice 16: Final build validation and handoff update.

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

Progress update rule:
After each slice is completed, update this file before moving on:
- Mark the slice checkbox as `[x]`.
- Add the files changed for that slice.
- Add commands run and pass/fail results.
- Add skipped validation, if any.
- Add blockers or follow-up risks.
- Update the next active slice.
