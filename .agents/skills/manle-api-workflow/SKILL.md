---
name: manle-api-workflow
description: Use when implementing or modifying the MANLE backend API with Bun and TypeScript, including customer/admin auth, sessions, customer profile self-service, Paddle checkout and webhooks, export authorization, tier entitlements, admin APIs, environment config, API contracts, and server-side validation.
---

# Manle API Workflow

Use this skill for backend work in the MANLE repository.

## Required Reading

Read these before editing backend files:

- `AGENTS.md`
- `api/AGENTS.md` if it exists
- `api/package.json` if it exists
- The target route, service, repository, schema, and tests for the behavior being changed
- `$manle-database-workflow` when a change touches Postgres tables, migrations, SQL, or persistence

Do not read or search `node_modules`, `dist`, `.vite`, coverage output, or generated files.

## Expected Backend Shape

Prefer a Bun + TypeScript API package under `api/**`. If the backend does not exist yet, create a simple package boundary instead of mixing backend code into `fe/**`:

- `api/src/index.ts` for Bun server bootstrap
- `api/src/config.ts` for validated environment loading
- `api/src/db/**` for Postgres connection and repositories
- `api/src/http/**` for routes, middleware, request parsing, and responses
- `api/src/services/**` for auth, customer profile, billing, entitlement, export quota, and admin business logic
- `api/src/types/**` or `api/src/contracts/**` for shared request/response shapes

Use the smallest framework footprint already present in the repo. If starting from zero, keep the server boring and explicit: typed handlers, centralized middleware, structured errors, and no hidden global state.

## Security Rules

- Store secrets only in environment variables. Never commit Paddle API keys, webhook secrets, session secrets, or database URLs.
- Use `httpOnly`, `secure` in production, and `sameSite` cookies for sessions.
- Hash passwords with a modern password hash such as Argon2id if password auth is implemented.
- Treat `role`, `tier`, `export_limit`, and subscription status as server-side authority. Frontend state is a display hint only.
- Require admin role checks on every `/admin` API route, not just in the admin UI.
- Require an authenticated user for every customer self-service mutation such as `/api/profile`.
- For profile updates, allow customers to change only their own name, email, and password. Never accept role, status, tier, quota, entitlement, Paddle ID, or admin-only field changes from self-service routes.
- Require current-password verification before changing a customer's email or password, and check duplicate email server-side.
- Validate every request body before it reaches service logic.
- Return generic auth errors to users; log specific causes server-side.

## Customer Account API Rules

- Keep `/api/me`, `/api/entitlements`, auth responses, and `/api/profile` aligned to the frontend `AccountState` shape.
- Return fresh entitlements and quota after login, signup, profile update, checkout callbacks, and export authorization.
- Use `requireUser` for customer account endpoints and `requireAdmin` only for admin-only routes. Admin self-service changes should still avoid bypassing the same password and identity checks unless a separate admin policy is explicit.

## Paddle Billing Rules

- Keep Paddle API keys backend-only.
- Use Paddle client-side tokens only in the frontend for checkout initialization.
- Treat Paddle webhooks as the billing source of truth. Checkout success events in the browser may update UI optimistically, but must not grant durable access.
- Verify webhook signatures against the raw request body before parsing or processing.
- Make webhook processing idempotent by storing the Paddle event ID before mutating subscription state.
- Store Paddle customer and subscription IDs against the local user.
- Prefer Paddle Customer Portal for invoices, payment method changes, cancellations, and subscription management instead of building custom billing screens.

## Entitlement And Export Rules

- Keep tier definitions server-side and backed by the database: `free`, `basic`, `plus`, `pro`.
- Enforce export limits in the API before client-side export starts.
- Authorize each export through an endpoint such as `POST /api/exports/authorize`.
- Track usage by user and local date or normalized UTC date deliberately; document the choice in code.
- Watermark, branding, and style permissions should come from the entitlement response, not from hardcoded frontend checks.

## Admin API Rules

- Keep admin APIs under `/api/admin/**`.
- Audit every admin mutation: actor, action, target, timestamp, and metadata.
- Prefer reversible status changes such as `disabled` over hard deletes for users, subscriptions, and tiers.
- Do not let admin tier edits silently drift from Paddle price IDs. Store local tier config and explicit `paddle_price_id` mappings.

## Validation

Run the narrowest command that covers the change:

- `cd api && bun run build` for TypeScript/build validation when available
- `cd api && bun test` for backend tests when available
- Use `$manle-database-workflow` validation for migrations or SQL changes
- If no backend package exists yet, report that package-level validation was not available
