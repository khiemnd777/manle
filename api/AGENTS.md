# api/AGENTS.md

## Backend Scope

This directory contains the MANLE Bun + TypeScript API. It owns customer/admin auth, customer profile self-service, Postgres persistence, Paddle subscription state, price tiers, promotions, entitlements, and export quota authorization.

`AGENT_DIRECTORY.md` is the detailed Codex feature directory for backend routes, services, tables, environment variables, and FE/admin contracts. Read it before broad search when locating an API behavior.

## Agent Ignore Rules

- Do not read or edit `node_modules/`, `dist/`, coverage output, or generated files.
- Keep secrets out of source. Use the root `.env` locally and root `.env.example` for documented variable names.

## Commands

- `bun run dev` starts the API on `127.0.0.1:8787` by default.
- `bun run build` validates that Bun can compile the API entrypoint.
- `bun run db:migrate` runs SQL migrations against `DATABASE_URL`.

## Working Rules

- Start with `AGENT_DIRECTORY.md` for route/service/table ownership and exact search anchors before scanning the package broadly.
- Require server-side admin role checks for every `/api/admin/**` route.
- Require an authenticated customer/admin session for every self-service account mutation such as `/api/profile`.
- Customer profile updates may change only the actor's own name, email, and password. Never let profile endpoints mutate role, status, tier, quota, entitlements, Paddle IDs, or admin-only fields.
- Require current-password verification for self-service email or password changes, and keep duplicate-email checks server-side.
- Keep Paddle API keys and webhook secrets backend-only.
- Verify Paddle webhooks with raw body before granting subscription access when webhook handling is implemented.
- Enforce tier and entitlement decisions in the API. Frontend checks are advisory only.
- Keep `/api/me`, `/api/entitlements`, and profile responses aligned with the frontend account state contract.
- Use parameterized SQL only.
- Audit admin mutations.
