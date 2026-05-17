---
name: manle-database-workflow
description: Use when implementing or modifying MANLE Postgres persistence, including schema design, migrations, SQL queries, repositories, auth/session storage, Paddle subscription tables, price tier tables, export usage counters, audit logs, seed data, and database validation.
---

# Manle Database Workflow

Use this skill for Postgres work in the MANLE repository.

## Required Reading

Read these before editing database files:

- `AGENTS.md`
- `api/AGENTS.md` or `db/AGENTS.md` if present
- Existing migrations, schema files, database client setup, and repository code
- `$manle-api-workflow` when SQL affects API behavior, auth, billing, or admin endpoints

Do not inspect generated database dumps, dependency folders, or build output unless the user explicitly asks.

## Schema Ownership

Prefer one migration source of truth. If the repo already has a migration tool, follow it. If starting from zero, keep migrations under a clear location such as:

- `api/db/migrations/**`, or
- `db/migrations/**`

Do not mix ad hoc SQL files with generated migration output unless the tooling requires it.

## Core Tables To Preserve

For the auth, Paddle, quota, and admin model, expect these concepts:

- `users`: email, name, password hash or auth provider fields, role, status, current tier, timestamps
- `sessions`: user ID, token hash, expiry, revocation metadata
- `price_tiers`: tier code, display name, monthly price, Paddle price ID, export limit, watermark flag, branding flag, style flag, active flag
- `subscriptions`: local user ID, Paddle customer ID, Paddle subscription ID, Paddle status, tier code, current period dates
- `export_usage`: user ID, usage date, export count, tier snapshot when useful
- `paddle_events`: Paddle event ID, event type, processed timestamp, raw payload or checksum for idempotency
- `audit_logs`: admin actor, action, target type, target ID, metadata, timestamp

Use foreign keys and unique constraints for invariants that must survive concurrent requests.

## Migration Rules

- Make migrations deterministic and reviewable.
- Prefer additive migrations for production safety.
- Use transactions for multi-step schema changes when Postgres supports it.
- Never drop columns, truncate tables, or rewrite critical auth/billing data without an explicit user-approved migration plan.
- Add indexes for common lookup paths: user email, session token hash, Paddle IDs, usage by user/date, audit log actor/time.
- Add seed data for default tiers only when the migration or seed mechanism is idempotent.

## Query And Repository Rules

- Parameterize all SQL. Never interpolate untrusted values.
- Keep auth, subscription, tier, and usage updates transactionally consistent.
- For export usage, use a transaction or atomic upsert so concurrent export attempts cannot bypass daily limits.
- Keep repository return shapes aligned with API contracts. Update mappers when schema names differ from API names.
- Store timestamps with `timestamptz` unless the repo has already standardized differently.

## Validation

Use the narrowest available validation:

- Run migration generation or migration status commands if the repo has a tool
- Use `psql` only against the intended local/dev database
- Run backend tests that cover repository behavior when available
- For risky SQL, explain the rollback path and any data assumptions
