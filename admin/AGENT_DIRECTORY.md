# Admin Agent Directory

This is the admin-console search-first directory for Codex agents. Read this
before broad `rg` when the task touches `/admin`, operational UI, admin auth,
customer management, billing state, promotions, price tiers, entitlements, or
audit logs.

The admin shell is intentionally compact: boot/auth/sidebar/metrics live in
`src/App.tsx`, lazy-loaded operational views live in `src/views/**`, shared UI
controls and helpers live in `src/adminShared.tsx`, and typed API calls plus
response types live in `src/api/client.ts`.

## Fast Entry Points

| User wording / keyword | Start here | Then check | Search anchors |
| --- | --- | --- | --- |
| admin login, initial setup, bootstrap | `src/App.tsx`, `src/api/client.ts` | `../api/src/index.ts`, `../api/src/services/auth.ts` | `InitialSetup`, `Login`, `bootstrapStatus`, `bootstrap`, `login`, `/api/admin/bootstrap`, `/api/admin/auth/login` |
| session refresh, unauthorized, credentials/cookies | `src/api/client.ts` | `../api/src/services/auth.ts`, `../api/src/http/response.ts` | `credentials: 'include'`, `refreshAdminAuth`, `canRefresh`, `ApiError`, `401`, `/api/admin/auth/refresh` |
| system users, admin/normal user roles, reset password | `src/views/SystemUsersView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `SystemUsersView`, `api.systemUsers`, `createSystemUser`, `updateSystemUser`, `/api/admin/system-users` |
| customer table, search, add customer, edit customer | `src/views/CustomersView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `CustomersView`, `api.customers`, `createCustomer`, `updateCustomer`, `customerEntitlements`, `Search name or email` |
| customer effective entitlements | `src/views/CustomersView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `entitlement-list`, `api.customerEntitlements`, `/customers/:id/entitlements`, `effectiveEntitlementsForUser` |
| subscriptions, manual override, cancel at period end | `src/views/SubscriptionsView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `SubscriptionsView`, `createSubscription`, `updateSubscription`, `manualOverride`, `cancelAtPeriodEnd` |
| Paddle sync by subscription/customer ID | `src/views/SubscriptionsView.tsx` | `src/api/client.ts`, `../api/src/services/paddle.ts` | `syncPaddle`, `syncSubscriptionId`, `syncCustomerId`, `/api/admin/paddle/sync` |
| Paddle credentials settings | `src/views/PaddleSettingsView.tsx` | `src/api/client.ts`, `../api/src/services/paddle.ts`, `../api/db/migrations/010_paddle_settings.sql`, `../api/db/migrations/011_paddle_settings_tokens.sql` | `PaddleSettingsView`, `api.paddleSettings`, `updatePaddleSettings`, `/api/admin/paddle/settings` |
| promotions, promo code, Paddle discount ID | `src/views/PromotionsView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `PromotionsView`, `createPromotion`, `updatePromotion`, `PROMO10`, `paddleDiscountId` |
| price tiers, export limits, watermark, branding, style flag, Paddle price ID | `src/views/TiersView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts`, `../api/db/migrations/001_admin_billing.sql` | `TiersView`, `savePriceTier`, `updatePriceTier`, `exportLimitPerDay`, `watermarkEnabled`, `paddlePriceId` |
| entitlements matrix | `src/views/EntitlementsView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `EntitlementsView`, `grantMap`, `updateTierEntitlement`, `EntitlementDefinition`, `EntitlementGrant` |
| email settings and templates | `src/views/EmailsView.tsx` | `src/RichTextEditor.tsx`, `src/api/client.ts`, `../api/src/services/admin.ts` | `EmailsView`, `emailSettings`, `emailTemplates`, `updateEmailSettings`, `createEmailTemplate`, `RichTextEditor` |
| illustration profiles, training, mapping proposals | `src/views/IllustrationProfilesView.tsx` | `src/api/client.ts`, `../api/src/index.ts`, `../api/src/services/illustrations.ts` | `IllustrationProfilesView`, `IllustrationProfileSummary`, `IllustrationProfileDetail`, `illustrationProfiles`, `createIllustrationProfile`, `trainIllustrationProfile`, `correctIllustrationTrainingExample`, `testIllustrationProfile`, `publishIllustrationProfile` |
| audit log | `src/views/AuditView.tsx` | `src/api/client.ts`, `../api/src/services/admin.ts` | `AuditView`, `api.audit`, `auditLogs`, `actorEmail`, `metadata` |
| CSS/layout/status badge/table styles | `src/styles.css`, `src/App.tsx` | n/a | `admin-layout`, `sidebar`, `topbar`, `panel`, `inline-form`, `mini-form`, `status-good`, `status-bad` |

## App Structure

Files:

- `src/main.tsx`: React root bootstrap.
- `src/App.tsx`: boot flow, auth screens, sidebar/topbar shell, metrics, admin data loading, and lazy view routing.
- `src/adminTypes.ts`: shared admin view/data types.
- `src/adminShared.tsx`: shared UI controls, toast context, form helpers, formatting helpers, and sorting helpers.
- `src/viewConfig.ts`: sidebar view metadata, navigation order, and empty admin data.
- `src/views/**`: lazy-loaded operational views, forms, tables, and local view state.
- `src/views/options.ts`: shared select option lists for view forms.
- `src/api/client.ts`: API base, refresh logic, `ApiError`, data types, `api` methods.
- `src/styles.css`: admin layout, forms, tables, badges, panels.

View union in `src/adminTypes.ts`; sidebar metadata in `src/viewConfig.ts`:

- `users`
- `customers`
- `subscriptions`
- `promotions`
- `tiers`
- `entitlements`
- `paddle`
- `emails`
- `illustrations`
- `audit`
- `profile`

Shared state in `AdminShell`:

- `view`: active sidebar section.
- `data`: `AdminData` containing overview, users, customers, subscriptions, promotions, tiers, entitlement definitions/grants, email settings/templates, illustration profiles, and audit logs.
- `loading`, `error`.

`loadAll(customerSearch = '', systemUserSearch = '', illustrationProfileSearch = '')` fetches in parallel:

- `api.overview()`
- `api.systemUsers()`
- `api.customers(search)`
- `api.subscriptions()`
- `api.promotions()`
- `api.priceTiers()`
- `api.entitlements()`
- `api.emailSettings()`
- `api.emailTemplates()`
- `api.illustrationProfiles()`
- `api.audit()`

If a mutation changes table data, call the provided `reload()` so UI does not
show stale admin state.

## Screen Directory

`App()` boot flow:

1. `api.bootstrapStatus()`
2. If admin exists, try `api.me()`
3. No admin: render `InitialSetup`
4. Has admin but no actor: render `Login`
5. Actor loaded: render `AdminShell`

`ScreenFrame`:

- Used for loading, error, initial setup, and login.
- Branding classes: `screen-frame`, `auth-panel`, `brand-row`, `brand-mark`.

`InitialSetup`:

- Form fields: `name`, `email`, `password`.
- Calls `api.bootstrap`.
- Password `minLength={10}` mirrors backend initial-admin rule.

`Login`:

- Form fields: `email`, `password`.
- Calls `api.login`.

`AdminShell`:

- Sidebar class: `sidebar`.
- Brand: `side-brand`.
- Footer/logout: `side-footer`, `api.logout`.
- Main class: `admin-main`.
- Topbar refresh button calls `loadAll()`.
- Metrics: `Metric` components for customers/subscriptions/promotions/tiers.

## View Directory

`SystemUsersView`:

- Create form fields: `name`, `email`, `role`, `status`, `password`, `confirmPassword`.
- Search form field: `search`.
- Table columns: Name, Email, Role, Status, Created.
- Detail form fields: `name`, `email`, `role`, `status`, optional `password`, optional `confirmPassword`.
- Saves through `api.createSystemUser` and `api.updateSystemUser`.
- Roles shown in UI: `admin`, `normal user`.

`CustomersView`:

- Create form fields: `name`, `email`, `tier`.
- Search form field: `search`.
- Table columns: Name, Email, Tier, Subscription, Exports, Status.
- Manage button calls `inspect(customer)` then `api.customerEntitlements(customer.id)`.
- Detail form fields: `name`, `email`, `status`, `tier`, `paddleCustomerId`, `notes`.
- Saves through `api.updateCustomer`.
- Entitlement display class: `entitlement-list`.

`SubscriptionsView`:

- Paddle sync form fields: `syncSubscriptionId`, `syncCustomerId`.
- Create form fields: `userId`, `tierCode`, `status`, `paddleCustomerId`, `paddleSubscriptionId`.
- Edit fields: `status`, `tierCode`, `paddleSubscriptionId`, `cancelAtPeriodEnd`, `manualOverride`.
- Status values shown in UI: `active`, `trialing`, `past_due`, `canceled`.
- Saves through `api.createSubscription`, `api.updateSubscription`, `api.syncPaddle`.

`PromotionsView`:

- Create fields: `code`, `name`, `tierCode`, `discountType`, `discountValue`, `maxRedemptions`, `paddleDiscountId`, `description`.
- Edit fields: `name`, `description`, `tierCode`, `discountType`, `discountValue`, `paddleDiscountId`, `active`.
- Discount types: `percent`, `amount`, `trial`, `custom`.
- Saves through `api.createPromotion`, `api.updatePromotion`.

`TiersView`:

- Create/edit fields: `code`, `name`, `monthlyPriceDollars`, `paddlePriceId`, `exportLimitPerDay`, `sortOrder`.
- Boolean flags: `watermarkEnabled`, `brandingEnabled`, `styleEditorEnabled`, `active`.
- Saves through `api.savePriceTier` or `api.updatePriceTier`.
- Backend stores cents as `monthlyPriceCents`; UI field is dollars.

`EntitlementsView`:

- Builds `grantMap` by `${tierCode}:${entitlementKey}`.
- Each cell posts `enabled` and `value`.
- Value parsing depends on backend definition `valueType`: `number`, `boolean`, `string`.
- Saves through `api.updateTierEntitlement`.

`PaddleSettingsView`:

- Form fields: `apiKey`, `clientToken`, `webhookSecret`, `clearApiKey`, `clearClientToken`, `clearWebhookSecret`.
- Displays redacted effective credential previews, sources, and updated time.
- Saves through `api.updatePaddleSettings`.

`IllustrationProfilesView`:

- Upload-to-upsert fields: `file`, optional `productType`, `maxPages`, `notes`.
- Manual create fields: `carrier`, `productName`, `productType`, `notes`.
- Search form field: `search`.
- Table columns: Carrier, Product, Type, Status, Active Version, Updated.
- Detail dialog shows status, active version, draft/published version summary,
  timestamps, notes, profile inventory counts, saved profile detail tables,
  train/test upload forms, mapping review tables, corrected output JSON, save
  approval, and publish controls.
- Saved profile detail tables show versions, training examples, fingerprints,
  field mappings, and projection mappings returned by
  `api.illustrationProfile`.
- Profile detail includes a Carrier logo panel for uploading or clearing the
  approved PNG/JPEG/WebP carrier logo used by generator runtime matches.
- Train/test upload fields: `file`, `notes`, `maxPages`, `useFastModel`.
- Training example statuses include `training`, `needs_review`, `reviewed`,
  `rejected`, and archived/uploaded states from the backend.
- Saved training examples show a Review action when the completed run has a
  persisted proposal. Older `needs_review` examples without
  `metadata.reviewProposal` show an Upload again action that scrolls back to
  Training PDF so the admin can regenerate review data.
- Field mapping review columns: MANLE Field, Detected Value, Evidence,
  Confidence, Strategy, Transform, Required, Action.
- Fingerprint and projection mapping tables support inline edit/ignore/restore.
- Publish is disabled until reviewed fingerprints and field mappings are saved
  to the draft version.
- Creates through `api.createIllustrationProfile`.
- Upload-to-upsert creates or opens a profile through
  `api.upsertIllustrationProfileFromPdf`.
- Opens details through `api.illustrationProfile`.
- Training/testing/publishing use `api.trainIllustrationProfile`,
  `api.testIllustrationProfile`,
  `api.correctIllustrationTrainingExample`, and
  `api.publishIllustrationProfile`.
- Carrier logo upload/removal uses `api.uploadIllustrationCarrierLogo` and
  `api.clearIllustrationCarrierLogo`.

`AuditView`:

- Displays `createdAt`, `actorEmail`, `action`, `targetType:targetId`, JSON metadata.

## API Client Directory

`src/api/client.ts`:

- `API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787'`
- `request(path, init)` always sends `credentials: 'include'`; JSON requests
  send `Content-Type: application/json`, while `FormData` upload requests let
  the browser set the multipart boundary.
- `canRefresh(path)` excludes login/logout/refresh/bootstrap.
- `refreshAdminAuth()` calls `POST /api/admin/auth/refresh`.
- `apiFetch<T>` retries once after 401 if refresh succeeds.
- Throws `ApiError(status, code, message)` using backend error payload.

Exported types:

- `Actor`
- `SystemUser`
- `Customer`
- `Subscription`
- `Promotion`
- `PriceTier`
- `EntitlementDefinition`
- `EntitlementGrant`
- `AuditLog`
- `IllustrationProfileSummary`
- `IllustrationProfileDetail`
- `IllustrationTrainingResponse`
- `IllustrationTrainingCorrectionInput`

Exported API methods:

- `bootstrapStatus`
- `bootstrap`
- `login`
- `logout`
- `me`
- `overview`
- `systemUsers`
- `systemUser`
- `createSystemUser`
- `updateSystemUser`
- `customers`
- `createCustomer`
- `updateCustomer`
- `customerEntitlements`
- `subscriptions`
- `createSubscription`
- `updateSubscription`
- `promotions`
- `createPromotion`
- `updatePromotion`
- `priceTiers`
- `savePriceTier`
- `updatePriceTier`
- `entitlements`
- `updateTierEntitlement`
- `paddleSettings`
- `updatePaddleSettings`
- `audit`
- `syncPaddle`
- `illustrationProfiles`
- `createIllustrationProfile`
- `illustrationProfile`
- `trainIllustrationProfile`
- `correctIllustrationTrainingExample`
- `testIllustrationProfile`
- `publishIllustrationProfile`

## Backend Endpoint Map For Admin UI

Admin UI endpoints are all implemented in `../api/src/index.ts` and serviced
mainly by `../api/src/services/admin.ts`.

- Bootstrap/auth: `/api/admin/bootstrap/status`, `/api/admin/bootstrap`, `/api/admin/auth/login`, `/api/admin/auth/refresh`, `/api/admin/auth/logout`, `/api/admin/me`
- Overview: `/api/admin/overview`
- System users: `/api/admin/system-users`, `/api/admin/system-users/:id`
- Customers: `/api/admin/customers`, `/api/admin/customers/:id`, `/api/admin/customers/:id/entitlements`
- Subscriptions: `/api/admin/subscriptions`, `/api/admin/subscriptions/:id`
- Paddle sync: `/api/admin/paddle/sync`
- Paddle settings: `/api/admin/paddle/settings`
- Promotions: `/api/admin/promotions`, `/api/admin/promotions/:id`
- Price tiers: `/api/admin/price-tiers`, `/api/admin/price-tiers/:code`
- Entitlements: `/api/admin/entitlements`, `/api/admin/entitlements/:tierCode/:key`
- Audit: `/api/admin/audit`
- Illustration profiles: `/api/admin/illustration-profiles`, `/api/admin/illustration-profiles/:id`, `/api/admin/illustration-profiles/:id/train`, `/api/admin/illustration-profiles/:id/examples/:exampleId`, `/api/admin/illustration-profiles/:id/test`, `/api/admin/illustration-profiles/:id/publish`

## CSS Directory

`src/styles.css` owns the operational admin style.

Search anchors:

- Shell/layout: `.admin-layout`, `.sidebar`, `.admin-main`, `.topbar`
- Auth/setup: `.screen-frame`, `.auth-panel`, `.auth-form`, `.brand-row`, `.brand-mark`
- Tables/forms: `table`, `.inline-form`, `.create-row`, `.stack-form`, `.mini-form`, `.sync-row`
- Panels/metrics: `.panel`, `.panel-head`, `.content-grid`, `.metric-grid`, `.metric`
- Status/messages: `.status`, `.status-good`, `.status-bad`, `.status-neutral`, `.error-box`, `.success-box`, `.loading`, `.empty`, `.muted`
- Entitlements: `.entitlement-list`, `.entitlement-cell`
- Illustration training: `.illustration-workbench`, `.illustration-upload-grid`, `.illustration-review-table`, `.low-confidence-row`

## Search Recipes

Find a view/component:

```bash
rg -n "CustomersView|SubscriptionsView|PromotionsView|TiersView|EntitlementsView|EmailsView|AuditView|InitialSetup|Login|AdminShell" admin/src
```

Find a form field:

```bash
rg -n "field\\(form, 'name'\\)|name=\"fieldName\"|defaultValue|defaultChecked" admin/src
```

Find an admin endpoint:

```bash
rg -n "/api/admin|api\\.methodName|methodName:" admin/src ../api/src
```

Find auth/refresh issues:

```bash
rg -n "credentials|refreshAdminAuth|canRefresh|ApiError|401|auth/refresh|auth/login|bootstrap" admin/src/api/client.ts admin/src/App.tsx
```

Find visual/layout issues:

```bash
rg -n "className=\"class-name|\\.class-name|status-|panel|sidebar|topbar|table" admin/src
```

## Agent Rules For Admin Changes

- Admin authority is backend-only. UI guards are display convenience, not security.
- Keep `src/api/client.ts` types and backend response shapes in sync.
- Mutations should refresh affected data through `reload()`.
- Keep loading, error, empty, and unauthorized states visible.
- Prefer disable/status changes over destructive delete flows.
- Keep UI dense and operational: tables, filters, compact forms, status badges.
- Run `cd admin && bun run build` after admin source/style changes.
