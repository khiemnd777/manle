# API Agent Directory

This is the backend search-first directory for Codex agents. Read this before
broad `rg` when the task touches auth, profile, billing, Paddle, admin APIs,
tiers, entitlements, export authorization, or database behavior.

The API is a Bun HTTP server with explicit route branches in `src/index.ts`.
There is no router framework. Route path, method, auth guard, service function,
and response shape are all visible in that file.

## Fast Entry Points

| User wording / keyword | Start here | Then check | Search anchors |
| --- | --- | --- | --- |
| route, endpoint, API not found, CORS | `src/index.ts`, `src/http/response.ts` | `src/config.ts` | `route`, `url.pathname`, `corsHeaders`, `allowedCorsOrigins`, `OPTIONS` |
| env, port, cookie, Paddle/OpenAI config, Redis, database URL | `src/config.ts` | `src/db/client.ts` | `DATABASE_URL`, `API_HOST`, `API_PORT`, `FE_ORIGIN`, `ADMIN_ORIGIN`, `PADDLE_`, `OPENAI_`, `REDIS_URL` |
| customer auth, signup, login, logout, refresh token, social login | `src/services/auth.ts` | `src/index.ts`, `db/migrations/002_refresh_tokens.sql`, `db/migrations/008_oauth_accounts.sql` | `signupCustomer`, `loginCustomer`, `startCustomerOAuth`, `completeCustomerOAuth`, `refreshCustomerSession`, `logoutSession`, `sessions`, `refresh_tokens`, `oauth_accounts` |
| admin auth, bootstrap, first admin, normal system user login | `src/services/auth.ts`, `src/index.ts` | `../admin/src/api/client.ts` | `getAdminBootstrapStatus`, `createInitialAdmin`, `loginAdmin`, `requireSystemUser`, `/api/admin/bootstrap`, `/api/admin/auth/login` |
| profile self-service, name/email/password | `src/services/auth.ts` | `../fe/src/account.ts` | `updateProfile`, `currentPassword`, `newPassword`, `email_exists`, `/api/profile` |
| current account state, `/api/me`, quota display | `src/services/entitlements.ts` | `src/services/admin.ts`, `../fe/src/account.ts` | `accountEntitlements`, `effectiveEntitlementsForUser`, `quota`, `requiresLogin` |
| export quota, PDF/PNG/JPG authorization | `src/services/entitlements.ts` | `db/migrations/001_admin_billing.sql`, `../fe/src/exportCard.ts` | `authorizeExport`, `export_usage`, `exports_per_day`, `export_quota_exceeded` |
| Paddle checkout, customer portal | `src/services/paddle.ts` | `src/config.ts`, `../fe/src/account.ts` | `getPaddleCheckoutConfig`, `createCustomerPortalSession`, `paddle_price_id`, `promotionCode`, `customer-portal` |
| Paddle credentials admin setting | `src/services/paddle.ts`, `src/index.ts` | `db/migrations/010_paddle_settings.sql`, `db/migrations/011_paddle_settings_tokens.sql`, `../admin/src/views/PaddleSettingsView.tsx` | `getPaddleSettings`, `updatePaddleSettings`, `paddle_settings`, `/api/admin/paddle/settings` |
| Paddle webhook, subscription sync, duplicate events | `src/services/paddle.ts` | `db/migrations/001_admin_billing.sql`, `src/services/admin.ts` | `verifyPaddleWebhook`, `handlePaddleWebhook`, `paddle_events`, `upsertPaddleSubscription`, `subscription.created` |
| admin customers, subscriptions, promotions, price tiers, entitlements, audit | `src/services/admin.ts` | `src/types/admin.ts`, `../admin/src/App.tsx` | `listCustomers`, `createCustomer`, `updateSubscription`, `upsertPriceTier`, `updateTierEntitlement`, `auditLogs` |
| system users, admin/normal user role, reset password | `src/services/admin.ts`, `src/index.ts` | `src/services/auth.ts`, `../admin/src/App.tsx` | `listSystemUsers`, `createSystemUser`, `updateSystemUser`, `/api/admin/system-users`, `role in ('admin', 'user')` |
| illustration profile training schema, PDF extraction profile storage | `db/migrations/012_illustration_profiles.sql` | `src/types/illustration.ts`, `src/services/illustrations.ts` | `illustration_profiles`, `illustration_profile_versions`, `illustration_training_examples`, `illustration_extraction_runs`, `illustration_profile_fingerprints`, `illustration_profile_field_mappings`, `illustration_profile_projection_mappings` |
| admin illustration profile CRUD/train/test/publish APIs | `src/index.ts`, `src/services/illustrations.ts` | `src/services/pdfExtraction.ts`, `src/services/openaiIllustrationExtraction.ts`, future admin client | `/api/admin/illustration-profiles`, `listIllustrationProfiles`, `createIllustrationProfile`, `upsertIllustrationProfileFromPdf`, `getIllustrationProfile`, `train`, `examples`, `test`, `publish` |
| normalized illustration extraction contracts, profile mappings, runtime extraction statuses | `src/types/illustration.ts` | `../fe/src/pdf.ts`, `../admin/src/api/client.ts` | `IllustrationExtract`, `IllustrationRuntimeExtractResponse`, `IllustrationTrainingProposal`, `unsupported_profile`, `no_published_profile`, `needs_review`, `extraction_failed`, `validateIllustrationExtract` |
| illustration profile repositories/services, draft/publish helpers, training examples, extraction run logs | `src/services/illustrations.ts` | `src/types/illustration.ts`, `src/index.ts` future routes | `listIllustrationProfiles`, `getIllustrationProfile`, `createIllustrationProfile`, `ensureDraftIllustrationProfileVersion`, `publishIllustrationProfileVersion`, `storeIllustrationTrainingExample`, `recordIllustrationExtractionRun` |
| backend PDF text/layout extraction, PDF hash, page lines/items | `src/services/pdfExtraction.ts` | `src/types/illustration.ts`, `../fe/src/pdf.ts` parser reference | `extractPdfTextLayout`, `PdfExtractionResult`, `fileSha256`, `pages`, `lines`, `items`, `pdfjs-dist` |
| deterministic published profile matching, carrier/product/form fingerprints | `src/services/illustrationMatching.ts` | `src/services/illustrations.ts`, `src/services/pdfExtraction.ts` | `matchPublishedIllustrationProfile`, `IllustrationProfileMatchCandidate`, `requiredMatched`, `matchedNonCarrierFingerprint`, `low_match_confidence` |
| runtime illustration extraction, published profile mapping application | `src/services/illustrationRuntimeExtraction.ts`, `src/index.ts` | `src/services/illustrationMatching.ts`, `src/services/pdfExtraction.ts`, `src/services/illustrations.ts`, `src/types/illustration.ts` | `/api/illustrations/extract`, `extractRuntimeIllustration`, `requireRuntimePdfFile`, `invalidRuntimeIllustrationUpload`, `runtime_extract`, `low_extraction_confidence`, `validation_failed` |
| OpenAI admin training extraction, structured mapping proposal | `src/services/openaiIllustrationExtraction.ts` | `src/config.ts`, `src/types/illustration.ts`, `src/services/pdfExtraction.ts` | `generateIllustrationTrainingProposal`, `OPENAI_EXTRACTOR_MODEL`, `OPENAI_EXTRACTOR_RETRY_MODEL`, `manle_illustration_training_proposal`, `text.format`, `json_schema` |
| database schema, table names, seed tier/entitlement values | `db/migrations/001_admin_billing.sql`, `db/migrations/002_refresh_tokens.sql` | service using the table | `create table`, `price_tiers`, `users`, `subscriptions`, `tier_entitlements`, `export_usage` |
| rate limit, Redis, too many requests | `src/services/redis.ts`, `src/index.ts` | `src/config.ts` | `rateLimit`, `assertRateLimit`, `rate_limited`, `rl:login`, `rl:signup` |

## Route Directory

All routes live in `src/index.ts`.

Public/system:

| Method/path | Auth | Handler/service | Notes |
| --- | --- | --- | --- |
| `GET /health` | none | inline | Returns `{ ok: true, service: 'manle-api' }`. |
| `OPTIONS *` | none | `corsHeaders` | CORS preflight. |

Customer account and billing:

| Method/path | Auth | Handler/service | Response/side effect |
| --- | --- | --- | --- |
| `GET /api/me` | optional cookie | `currentUser`, `accountEntitlements` | Account state for FE; guest returns free tier, billing link status, and `requiresLogin`. |
| `GET /api/entitlements` | optional cookie | `currentUser`, `accountEntitlements` | Same effective entitlements/quota/billing shape used by FE. |
| `PATCH /api/profile` | `requireUser` | `updateProfile`, then `accountEntitlements` | Name/email/password self-service; email/password require current password. |
| `POST /api/auth/signup` | none | `assertRateLimit`, `signupCustomer` | Creates customer, returns account state plus auth cookies. |
| `POST /api/auth/login` | none | `assertRateLimit`, `loginCustomer` | Customer login only; returns account state plus cookies. |
| `GET /api/auth/oauth/google/start` | none | `startCustomerOAuth` | Redirects to Google OAuth with state cookie. |
| `GET /api/auth/oauth/google/callback` | OAuth state cookie | `completeCustomerOAuth` | Exchanges code, links/creates customer, sets auth cookies, redirects to FE. |
| `GET /api/auth/oauth/apple/start` | none | `startCustomerOAuth` | Redirects to Apple OAuth with state cookie. |
| `POST /api/auth/oauth/apple/callback` | OAuth state cookie | `completeCustomerOAuth` | Exchanges code, links/creates customer, sets auth cookies, redirects to FE. |
| `POST /api/auth/refresh` | refresh cookie | `refreshCustomerSession` | Rotates refresh token and returns fresh cookies/account state. |
| `POST /api/auth/logout` | optional cookie | `logoutSession` | Revokes access/refresh tokens and clears cookies. |
| `POST /api/exports/authorize` | `requireUser` | `authorizeExport` | Increments quota if under limit; returns watermark/branding/style flags. |
| `POST /api/illustrations/extract` | optional cookie, rate limited | `extractRuntimeIllustration` | Multipart PDF runtime extraction using published profiles only; no OpenAI call. Returns `IllustrationRuntimeExtractResponse`. |
| `POST /api/billing/checkout` | `requireUser` | `getPaddleCheckoutConfig` | Returns Paddle client token, price ID, tier, discount, customer/customData. |
| `GET /api/billing/paddle-client` | none | `getPaddleClientConfig` | Returns public Paddle environment and client-side token for payment-link checkout pages. |
| `POST /api/billing/customer-portal` | `requireUser` | `createCustomerPortalSession` | Requires linked `paddle_customer_id`. |
| `POST /api/webhooks/paddle` | Paddle signature | `handlePaddleWebhook` | Verifies raw body signature, idempotently stores event, updates customer/subscription. |

Admin bootstrap/auth:

| Method/path | Auth | Handler/service | Notes |
| --- | --- | --- | --- |
| `GET /api/admin/bootstrap/status` | none | `getAdminBootstrapStatus` | Checks whether any admin exists. |
| `POST /api/admin/bootstrap` | none, only before admin exists | `createInitialAdmin` | Creates first admin. Does not currently set auth cookies. |
| `POST /api/admin/auth/login` | none | `loginAdmin` | Internal `admin` and `user` login; returns cookies. |
| `POST /api/admin/auth/refresh` | refresh cookie | `refreshAdminSession` | Rotates internal admin-console refresh token. |
| `POST /api/admin/auth/logout` | optional cookie | `logoutSession` | Clears admin cookies. |
| `GET /api/admin/me` | `requireSystemUser` | inline | Returns current internal actor for `admin` or `user` role. |

Admin protected routes. `/api/admin/me` accepts internal `admin` and `user`
roles, then `src/index.ts` rejects non-admin requests with `requireAdmin()`
before reaching these data-management branches.

| Method/path | Service | Notes |
| --- | --- | --- |
| `GET /api/admin/overview` | `overview` | Counts system users, customers, active/trial subscriptions, active promotions, active tiers. |
| `GET /api/admin/system-users?search=` | `listSystemUsers` | Lists internal `admin` and `user` accounts, not customers. |
| `POST /api/admin/system-users` | `createSystemUser` | Creates an internal account with role `admin` or `user`; audits `system_user.create`. |
| `GET /api/admin/system-users/:id` | `getSystemUser` | Returns internal user detail. |
| `PATCH /api/admin/system-users/:id` | `updateSystemUser` | Updates name/email/role/status/password; audits `system_user.update`. |
| `GET /api/admin/paddle/settings` | `getPaddleSettings` | Returns redacted Paddle API key, client token, and webhook secret status/source. |
| `PATCH /api/admin/paddle/settings` | `updatePaddleSettings` | Updates or clears admin-stored Paddle credentials; audits `paddle.settings.update`. |
| `POST /api/admin/paddle/sync` | `syncPaddleSubscription` | Sync by Paddle subscription ID or customer ID; audits action. |
| `GET /api/admin/illustration-profiles?search=` | `listIllustrationProfiles` | Lists illustration training profiles with active published version summary when present. |
| `POST /api/admin/illustration-profiles` | `createIllustrationProfile` | Creates draft profile and initial draft version; audits `illustration_profile.create`. |
| `POST /api/admin/illustration-profiles/upsert-from-pdf` | `extractPdfTextLayout`, `upsertIllustrationProfileFromPdf` | Multipart `file`/`pdf` upload; extracts carrier/product/product type from PDF text and creates or opens the matching profile. |
| `GET /api/admin/illustration-profiles/:id` | `getIllustrationProfile` | Returns profile detail with versions, mappings, fingerprints, and training examples. |
| `POST /api/admin/illustration-profiles/:id/carrier-logo` | `updateIllustrationCarrierLogo` | Uploads a reviewed PNG/JPEG/WebP carrier logo asset reused by matching runtime profiles. |
| `DELETE /api/admin/illustration-profiles/:id/carrier-logo` | `clearIllustrationCarrierLogo` | Removes the carrier logo asset for the selected profile's carrier. |
| `POST /api/admin/illustration-profiles/:id/train` | `extractPdfTextLayout`, `storeIllustrationTrainingExample`, `generateIllustrationTrainingProposal` | Multipart `file`/`pdf` upload; stores example/run, calls OpenAI admin training, returns proposal. |
| `PATCH /api/admin/illustration-profiles/:id/examples/:exampleId` | `applyIllustrationTrainingCorrection` | Stores admin-corrected output and optionally replaces draft fingerprints/mappings. |
| `POST /api/admin/illustration-profiles/:id/test` | `extractPdfTextLayout`, `generateIllustrationTrainingProposal` | Multipart `file`/`pdf` upload; records admin test run without storing a training example. |
| `POST /api/admin/illustration-profiles/:id/publish` | `publishIllustrationProfileVersion` | Publishes supplied `profileVersionId` or current draft after required mapping/fingerprint validation. |
| `GET /api/admin/customers?search=` | `listCustomers` | Returns up to 200 customers with current tier, exports today, latest subscription status/tier. |
| `POST /api/admin/customers` | `createCustomer` | Creates customer without password; audits `customer.create`. |
| `PATCH /api/admin/customers/:id` | `updateCustomer` | Updates email/name/status/current tier/Paddle customer ID/notes; audits `customer.update`. |
| `GET /api/admin/customers/:id/entitlements` | `effectiveEntitlementsForUser` | Shows effective tier and entitlement map for selected customer. |
| `GET /api/admin/subscriptions?userId=` | `listSubscriptions` | Returns subscription rows joined to customer name/email. |
| `POST /api/admin/subscriptions` | `createSubscription` | Manual subscription insert; audits `subscription.create`. |
| `PATCH /api/admin/subscriptions/:id` | `updateSubscription` | Manual subscription update; audits `subscription.update`. |
| `GET /api/admin/promotions` | `listPromotions` | Lists promo codes and Paddle discount IDs. |
| `POST /api/admin/promotions` | `createPromotion` | Creates promo; audits `promotion.create`. |
| `PATCH /api/admin/promotions/:id` | `updatePromotion` | Updates promo; audits `promotion.update`. |
| `GET /api/admin/price-tiers` | `listPriceTiers` | Lists tier config and Paddle price IDs. |
| `POST /api/admin/price-tiers` | `upsertPriceTier` | Creates/upserts tier; audits `tier.upsert`. |
| `PATCH /api/admin/price-tiers/:code` | `upsertPriceTier` | Updates tier by path code. |
| `GET /api/admin/entitlements` | `listEntitlements` | Returns definitions, tiers, and grant matrix. |
| `PATCH /api/admin/entitlements/:tierCode/:key` | `updateTierEntitlement` | Upserts grant value/enabled flag; audits `entitlement.update`. |
| `GET /api/admin/audit` | `auditLogs` | Last 100 audit rows. |

## Service Directory

`src/services/auth.ts`:

- Cookie parsing and cookie headers: `parseCookies`, `authCookieHeaders`, `clearAuthCookieHeaders`.
- Token generation and hashing: `randomToken`, `sha256Hex`, `tokenPair`.
- Session persistence: `createSession`, `rotateSession`, `logoutSession`.
- Login lookup: `findLoginUser`.
- Admin bootstrap: `getAdminBootstrapStatus`, `createInitialAdmin`.
- Customer auth: `signupCustomer`, `loginCustomer`, `refreshCustomerSession`.
- Social customer auth: `startCustomerOAuth`, `completeCustomerOAuth`, `oauth_accounts`.
- Admin auth: `loginAdmin`, `refreshAdminSession`.
- System user auth: `requireSystemUser` allows `admin` and `user` actors to load `/api/admin/me`.
- Profile self-service: `updateProfile`.
- Guards: `currentUser`, `requireUser`, `requireAdmin`.

`src/services/entitlements.ts`:

- `effectiveEntitlementsForTier`: guest/free fallback.
- `accountEntitlements`: frontend account state, tier, entitlement map, quota.
- `authorizeExport`: validates format, checks `exports_per_day`, increments `export_usage`, returns export flags.

`src/services/admin.ts`:

- `audit`: writes `audit_logs`.
- `overview`: dashboard counts.
- System user CRUD: `listSystemUsers`, `getSystemUser`, `createSystemUser`, `updateSystemUser`.
- Customer CRUD: `listCustomers`, `createCustomer`, `updateCustomer`.
- Subscription CRUD: `listSubscriptions`, `createSubscription`, `updateSubscription`.
- Promotion CRUD: `listPromotions`, `createPromotion`, `updatePromotion`.
- Tier config: `listPriceTiers`, `upsertPriceTier`.
- Entitlements matrix: `listEntitlements`, `updateTierEntitlement`, `effectiveEntitlementsForUser`.
- Audit view: `auditLogs`.

`src/services/paddle.ts`:

- Settings: `getPaddleSettings`, `updatePaddleSettings`, admin-stored API key/client token/webhook secret with env fallback.
- Config guards: `requirePaddleApiKey`, `requirePaddleClientToken`.
- API wrapper: `paddleFetch`.
- Client config: `getPaddleClientConfig` for Paddle payment links.
- Checkout: `getPaddleCheckoutConfig`.
- Portal: `createCustomerPortalSession`.
- Webhook verification: `verifyPaddleWebhook`, `parseSignatureHeader`, `hmacSha256Hex`, `timingSafeEqual`.
- Mapping helpers: `findUserForPaddleData`, `tierFromPaddleData`, `firstPriceId`.
- Mutations from Paddle: `upsertPaddleCustomer`, `upsertPaddleSubscription`, `updatePromotionRedemption`.
- Event entrypoint: `handlePaddleWebhook`.
- Manual sync: `syncPaddleSubscription`.

`src/services/redis.ts`:

- `rateLimit(key, max, windowSeconds)` uses Redis if available. If Redis is not reachable it currently allows the request.

`src/services/illustrations.ts`:

- Profile service/repository helpers: `listIllustrationProfiles`, `getIllustrationProfile`, `createIllustrationProfile`, `updateIllustrationProfile`.
- Carrier logo assets: `updateIllustrationCarrierLogo`, `clearIllustrationCarrierLogo`, and profile summary/detail `carrierLogoUrl` fields.
- PDF profile identity helper: `upsertIllustrationProfileFromPdf` extracts carrier/product/product type from an uploaded PDF and creates or opens the matching profile.
- Version helpers: `ensureDraftIllustrationProfileVersion`, `publishIllustrationProfileVersion`, `listPublishedIllustrationProfileVersions`, `getPublishedIllustrationProfileVersion`.
- Mapping loaders: `listFingerprintsForVersion`, `listFieldMappingsForVersion`, `listProjectionMappingsForVersion`.
- Training/correction/run storage: `storeIllustrationTrainingExample`, `updateIllustrationTrainingExample`, `applyIllustrationTrainingCorrection`, `replaceIllustrationProfileVersionMappings`, `recordIllustrationExtractionRun`, `updateIllustrationExtractionRun`, `listIllustrationExtractionRuns`.
- Training example lifecycle: admin train starts examples as `training`, marks
  completed OpenAI proposals as `needs_review`, marks OpenAI failures as
  `rejected`, and marks saved admin corrections as `reviewed`.
- Profile detail includes recent extraction runs. Admin train stores the full
  review proposal under run `metadata.reviewProposal` so the Admin UI can reopen
  mapping review after refresh.
- Publish validation: `validatePublishableIllustrationProfileVersion` requires required field mappings plus required carrier and non-carrier fingerprints.
- Admin mutations call `audit`; profile CRUD/train/test/publish helpers are exposed through admin-only routes in `src/index.ts`.

`src/services/pdfExtraction.ts`:

- Backend PDF.js loader and `extractPdfTextLayout(input, options)` for File/Blob/ArrayBuffer/Uint8Array inputs.
- Returns SHA-256, file size, page count, combined text, per-page text, grouped lines, and positioned text items.
- Uses `pdfjs-dist` through runtime dynamic import so the API bundle does not inline optional PDF.js rendering dependencies.
- Keeps raw PDF text out of logs; callers should store only limited evidence snippets.

`src/services/illustrationMatching.ts`:

- `matchPublishedIllustrationProfile(pdf, { productType })` loads published profiles and scores approved fingerprints against extracted PDF text.
- Supports `contains`, `equals`, `regex`, and `normalized_contains` match strategies with optional page hints.
- Requires all required fingerprints, the published version `minMatchScore`, and at least one non-carrier fingerprint match before returning `matched`.
- Returns explicit `no_published_profile`, `unsupported_profile`, or `low_match_confidence` blocked statuses for runtime callers.

`src/services/illustrationRuntimeExtraction.ts`:

- `extractRuntimeIllustration(input)` powers `POST /api/illustrations/extract`.
- Extracts PDF text/layout, matches only active published profile versions, and
  applies approved field/projection mappings without OpenAI.
- Supports deterministic mapping strategies: `label_value`, `regex`,
  `table_cell`, `filename`, and `constant`; `manual` mappings are not used at
  runtime.
- Returns blocked runtime statuses for no published profile, unsupported
  profile, low match confidence, low extraction confidence, validation failure,
  invalid PDF, or parse failure.
- Records `runtime_extract` rows with limited evidence snippets and metadata,
  not full raw PDF text.

`src/services/openaiIllustrationExtraction.ts`:

- `generateIllustrationTrainingProposal(input)` is the admin-training-only OpenAI service for profile mapping proposals.
- Calls the OpenAI Responses API with Structured Outputs (`text.format` JSON schema) and does not run in generator/runtime extraction.
- Reads `OPENAI_API_KEY`, `OPENAI_EXTRACTOR_FAST_MODEL`, `OPENAI_EXTRACTOR_MODEL`, `OPENAI_EXTRACTOR_RETRY_MODEL`, `OPENAI_EXTRACTOR_ALLOW_RETRY`, and `OPENAI_EXTRACTOR_ALLOW_ESCALATION` from `src/config.ts`.
- Returns `succeeded`, `needs_review`, or `failed`; normalized output is validated with `validateIllustrationExtract`.
- Sends PDF text excerpts to OpenAI but does not log/store full raw PDF text; evidence snippets are truncated before returning.

`src/types/illustration.ts`:

- Normalized extract contract: `IllustrationExtract`, IUL/Term client, policy, projection, agent, evidence, match score, and field confidence shapes.
- Profile/admin contracts: profile summaries/details, fingerprints, field mappings, projection mappings, training uploads, and OpenAI training proposals.
- Runtime response contract: `IllustrationRuntimeExtractResponse` with explicit `unsupported_profile`, `no_published_profile`, `needs_review`, and `extraction_failed` statuses.
- Validation helpers: `validateIllustrationExtract`, confidence/product/gender guards, required field paths, and runtime-to-run status mapping.

HTTP/config/db:

- `src/config.ts`: environment and Paddle API base.
- `src/http/errors.ts`: `AppError`, `fail`.
- `src/http/response.ts`: CORS and JSON response helpers.
- `src/db/client.ts`: Bun SQL singleton, `one()`.
- `src/db/migrate.ts`: runs sorted SQL migrations from `api/db/migrations`.

## Database Directory

Migrations:

- `db/migrations/001_admin_billing.sql`
- `db/migrations/002_refresh_tokens.sql`
- `db/migrations/003_benefit_editor_entitlement.sql`
- `db/migrations/004_price_tier_benefit_editor_flag.sql`
- `db/migrations/005_price_tier_pricing_badge.sql`
- `db/migrations/006_system_user_role.sql`
- `db/migrations/007_email_templates.sql`
- `db/migrations/008_oauth_accounts.sql`
- `db/migrations/009_custom_template_entitlement.sql`
- `db/migrations/010_paddle_settings.sql`
- `db/migrations/011_paddle_settings_tokens.sql`
- `db/migrations/012_illustration_profiles.sql`

Tables:

- `price_tiers`: tier code/name/monthly price/Paddle price/export limit/watermark/branding/style/active/sort order.
- `paddle_settings`: singleton admin-stored Paddle credential overrides.
- `users`: email/name/password hash/role/status/current tier/Paddle customer ID/notes. Roles are `customer`, `admin`, and internal normal `user`.
- `sessions`: access token hashes and expiry.
- `refresh_tokens`: refresh token hashes, family rotation, revoked/replaced tracking.
- `oauth_accounts`: Google/Apple provider subject links for customer social login.
- `subscriptions`: local and Paddle subscription state, tier, billing period, manual override, metadata.
- `promotions`: promo code, tier scope, discount type/value, redemption count, Paddle discount ID.
- `entitlements`: entitlement definitions and defaults.
- `tier_entitlements`: per-tier enabled/value grants.
- `export_usage`: per-user per-Postgres-current-date export count.
- `paddle_events`: idempotency store for webhook event IDs.
- `audit_logs`: admin mutation audit trail.
- `illustration_profiles`: carrier/product identity, product type, and active/draft/archive status.
- `illustration_profile_versions`: draft/published/archived profile configs with match and extraction confidence thresholds.
- `illustration_training_examples`: uploaded sample PDF metadata, hashes, corrected extracts, and evidence snippets.
- `illustration_extraction_runs`: admin/runtime extraction run logs, status, confidence, normalized output, and limited evidence.
- `illustration_profile_fingerprints`: approved carrier/product/form/version match markers for profile versions.
- `illustration_profile_field_mappings`: approved field-level source selectors and transforms for profile versions.
- `illustration_profile_projection_mappings`: approved projection table or summary-block mappings for profile versions.

Seed tier codes:

- `free`: 3 exports/day, watermark on, branding off, style editor off.
- `basic`: 10 exports/day, watermark off, branding off, style editor off.
- `plus`: 20 exports/day, watermark off, branding on, style editor off.
- `pro`: 50 exports/day, watermark off, branding on, style editor on.

Seed entitlement keys:

- `watermark`
- `exports_per_day`
- `branding`
- `style_editor`

## Environment Directory

`src/config.ts` reads:

- `DATABASE_URL`
- `API_HOST` default `127.0.0.1`
- `API_PORT` default `8787`
- `FE_ORIGIN` default `http://127.0.0.1:5173`
- `ADMIN_ORIGIN` default `http://127.0.0.1:5174`
- `CORS_ORIGINS` comma-separated extra origins
- `REDIS_URL` default `redis://127.0.0.1:6379`
- `SESSION_COOKIE_NAME` default `manle_session`
- `REFRESH_COOKIE_NAME` default `manle_refresh`
- `ACCESS_TOKEN_MINUTES` default `15`
- `REFRESH_TOKEN_DAYS` or `SESSION_DAYS` default `14`
- `COOKIE_SECURE` default `false`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_CLIENT_TOKEN`
- `PADDLE_ENV` default `sandbox`
- `PADDLE_WEBHOOK_TOLERANCE_SECONDS` default `300`
- `OPENAI_API_KEY`
- `OPENAI_EXTRACTOR_FAST_MODEL` default `gpt-4.1-nano`
- `OPENAI_EXTRACTOR_MODEL` default `gpt-4o-mini`
- `OPENAI_EXTRACTOR_RETRY_MODEL` default `gpt-4.1-mini`
- `OPENAI_EXTRACTOR_ALLOW_RETRY` default `true`
- `OPENAI_EXTRACTOR_ALLOW_ESCALATION` default `false`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `APPLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_TEAM_ID`, `APPLE_OAUTH_KEY_ID`, `APPLE_OAUTH_PRIVATE_KEY`, `APPLE_OAUTH_CLIENT_SECRET`, `APPLE_OAUTH_REDIRECT_URI`

## Cross-Package Contracts

Frontend generator contract:

- `../fe/src/account.ts` expects `/api/me`, `/api/entitlements`, auth responses, `/api/profile`, checkout, portal, and export authorization to share the account state shape from `accountEntitlements`.
- Export flow calls `/api/exports/authorize` before html2canvas/jsPDF work starts.
- Profile updates must return fresh account state including actor, tier, entitlements, quota.

Admin console contract:

- `../admin/src/api/client.ts` contains the exact TS response types consumed by the admin UI.
- Admin table/form views in `../admin/src/App.tsx` assume endpoint names from this directory.
- Changing backend admin payload names requires updating `admin/src/api/client.ts` and affected `App.tsx` views together.

## Search Recipes

Route lookup:

```bash
rg -n "url\\.pathname|/api/admin|/api/auth|/api/billing|/api/exports|/api/profile|/api/me" api/src/index.ts
```

Find service owners:

```bash
rg -n "functionName|error_code|table_name|endpoint" api/src api/db/migrations --glob '!**/node_modules/**' --glob '!**/dist/**'
```

Find schema/table usage:

```bash
rg -n "users|sessions|refresh_tokens|subscriptions|promotions|price_tiers|entitlements|tier_entitlements|export_usage|paddle_events|audit_logs" api/src api/db/migrations
```

Find auth/profile issues:

```bash
rg -n "updateProfile|currentPassword|newPassword|requireUser|requireAdmin|loginCustomer|loginAdmin|refreshSession|logoutSession" api/src/services/auth.ts api/src/index.ts
```

Find billing/Paddle issues:

```bash
rg -n "Paddle|paddle|checkout|portal|webhook|subscription|promotionCode|priceId|discountId" api/src/services/paddle.ts api/src/index.ts api/db/migrations
```

Find export quota issues:

```bash
rg -n "authorizeExport|exports_per_day|export_usage|quota|watermark|branding|style_editor" api/src api/db/migrations
```

## Agent Rules For API Changes

- Every `/api/admin/**` route after auth/bootstrap must remain behind `requireAdmin`.
- Every customer profile mutation must remain behind `requireUser`.
- Self-service profile may change only the actor's name/email/password.
- Email or password self-service changes require `currentPassword`.
- Paddle API keys and webhook secrets stay backend-only.
- Paddle webhook processing must verify raw-body signature before parsing/mutation and remain idempotent through `paddle_events`.
- Export limits are server-authoritative; frontend checks are advisory.
- Use parameterized SQL through Bun SQL template tags.
- Audit admin mutations.
- Run `cd api && bun run build` after backend source changes.
