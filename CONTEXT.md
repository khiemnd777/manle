# MANLE Agent Context

This file is the stable context layer for MANLE agent work. Read it when a task
needs product vocabulary, cross-package boundaries, or decision history before
editing code. Prefer the package `AGENT_DIRECTORY.md` files for exact source
entry points.

## Product Shape

MANLE generates client-facing insurance cards and backs them with account,
billing, admin, entitlement, and quota infrastructure.

- `fe/` is the customer generator. It is a React/Vite shell that mounts
  `fe/src/template.html`, then binds behavior imperatively from TypeScript.
- `api/` is the Bun backend for customer and admin auth, profile self-service,
  Paddle billing, subscription state, entitlement checks, export quotas, and
  admin APIs.
- `admin/` is the internal admin console for operational customer, tier,
  subscription, promotion, entitlement, and audit workflows.

## Core Vocabulary

- Customer: an external generator user. Customer self-service may update only
  the customer's own name, email, and password through authenticated API routes.
- System user: an internal admin-console actor with role `admin` or normal
  internal `user`.
- Tier: a billing/product tier such as `free`, `basic`, `plus`, or `pro`.
- Entitlement: a server-authoritative capability derived from tier state, such
  as exports per day, watermark, branding, or style editor access.
- Export quota: the server-side authorization and usage counter checked before
  PDF, PNG, or JPG export starts.
- IUL card: the Indexed Universal Life product card driven by shared client
  fields plus IUL policy and cash-value projection fields.
- Term Life card: the Term Life card driven by shared client fields plus
  term-specific face amount, premium, and term-length fields.
- PDF-derived values: values extracted from uploaded illustrations, especially
  IUL tabular rows stored in `actualCSV`, `actualPVMap`, and `actualDBMap`.
- Paddle state: subscription, customer, price, discount, and webhook state from
  Paddle. Webhooks are the durable billing source of truth.

## Non-Negotiable Invariants

- Treat `fe/src/template.html` IDs/classes as app contract.
- Preserve the DOM-driven frontend architecture unless the user explicitly asks
  for a larger refactor.
- Keep IUL and Term Life synchronized for shared client, risk, agent, footer,
  header, and style behavior.
- Keep product-specific policy fields separate where the app already separates
  them.
- Do not invent insurance illustration values.
- Clear stale PDF-derived cash-value maps when manual policy edits invalidate
  extracted data.
- Keep customer profile, billing, tier, quota, and entitlement authority on the
  server.
- Require current-password validation before customer email or password changes.
- Verify Paddle webhooks against the raw request body and process events
  idempotently.
- Preserve bilingual English/Vietnamese UI text unless the task is explicitly
  copy-only.
- Do not edit generated output: `dist`, `node_modules`, `.vite`, image layers,
  or build caches.

## Agent Documents

- `docs/agents/domain.md` contains a fuller glossary and contract map.
- `docs/agents/triage-labels.md` defines local triage categories and severity.
- `docs/agents/issue-slices.md` defines vertical-slice planning format.
- `docs/agents/handoff.md` defines handoff and continuation notes.
- `docs/adr/` stores architecture decisions that should survive across tasks.

## Package Maps

- `fe/AGENT_DIRECTORY.md` maps generator wording, DOM IDs, and feature owners.
- `api/AGENT_DIRECTORY.md` maps routes, services, tables, and API contracts.
- `admin/AGENT_DIRECTORY.md` maps admin-console views and API calls.

Read the relevant package map before broad source searches.
