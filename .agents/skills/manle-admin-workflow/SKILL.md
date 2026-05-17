---
name: manle-admin-workflow
description: Use when implementing or modifying the MANLE admin frontend under admin/** with React, TypeScript, Vite, and Bun, including /admin routes, login/session-aware guards, user management, price tier management, Paddle billing state display, API clients, forms, tables, and admin-only UI validation.
---

# Manle Admin Workflow

Use this skill for the MANLE admin site.

## Required Reading

Read these before editing admin files:

- `AGENTS.md`
- `admin/AGENTS.md` if it exists
- `admin/package.json` if it exists
- The target route, API client, schema, component, and test files
- `$manle-api-workflow` when admin UI changes require API contract or auth behavior changes
- `$manle-database-workflow` when admin UI changes require tier, user, subscription, or audit schema changes

Do not read or edit `admin/node_modules`, `admin/dist`, `.vite`, or generated output.

## Expected Admin Shape

Prefer a separate Bun-managed Vite package under `admin/**`. If the admin app does not exist yet, scaffold a small React + TypeScript + Vite app rather than embedding admin screens into the card generator package.

Expected boundaries:

- `admin/src/main.tsx` and `admin/src/App.tsx` for bootstrap
- `admin/src/routes/**` for `/admin` screens
- `admin/src/api/**` for typed backend calls
- `admin/src/components/**` for shared tables, forms, dialogs, and status badges
- `admin/src/auth/**` for session loading and admin route guards
- `admin/src/styles.css` or an existing design system file for styling

## UI Scope

Build a simple operational admin surface, not a marketing page:

- `/admin/login` or reuse app login if backend sessions already exist
- `/admin/users` with search, status, tier, export usage today, and subscription status
- `/admin/users/:id` for user details, role/status changes, tier override if allowed, and Paddle identifiers
- `/admin/tiers` for tier config: label, monthly price, export limit, watermark, branding, style, Paddle price ID, active flag
- `/admin/audit` for recent admin mutations when the API supports it

Use dense, scannable layouts. Avoid decorative cards for whole sections; use tables, filters, compact forms, dialogs, and status badges.

## Contract Rules

- Never hardcode admin authority in the frontend. Backend role checks are mandatory.
- Treat frontend tier values as display data from `/api/admin/tiers`.
- Keep request and response types explicit. If backend contracts change, update API clients and affected screens together.
- Surface backend validation messages without exposing secrets or raw stack traces.
- Do not store Paddle API keys, webhook secrets, or session secrets in frontend code.

## Interaction Rules

- Confirm destructive admin actions in UI.
- Prefer deactivate/disable over delete.
- Show loading, empty, error, and unauthorized states.
- Keep user and tier mutations auditable by sending clear action intent to the API.
- After mutations, refresh the affected query or local state so stale tier/user data is not shown.

## Validation

Run the narrowest command that covers the change:

- `cd admin && bun run build` for TypeScript/Vite validation when available
- Browser smoke test for `/admin`, login guard, user table, tier table, and mutation dialogs when UI changes are substantial
- If no admin package exists yet, report that package-level validation was not available
