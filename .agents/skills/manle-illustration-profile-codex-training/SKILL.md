---
name: manle-illustration-profile-codex-training
description: Use when creating MANLE Illustration Profiles from PDFs through Codex analysis, outcome review tables, deterministic mappings, and approved database migrations instead of the OpenAI admin training route.
---

# Manle Illustration Profile Codex Training

Use this skill when the task is to analyze insurance illustration PDFs with
Codex, prepare reviewed Illustration Profile mappings, and create migration SQL
for those mappings.

This skill does not replace or remove the OpenAI admin-training code path. For
this workflow, ignore that route unless the user explicitly asks to compare or
modify it.

## Required Reading

Read these before analyzing PDFs or writing migration artifacts:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/agents/illustration-profile-codex-training.md`
- `api/AGENT_DIRECTORY.md`
- `api/db/migrations/012_illustration_profiles.sql`
- `api/src/types/illustration.ts`
- `api/src/services/illustrationMappingEngine.ts`
- `api/src/services/illustrationRuntimeExtraction.ts`
- `api/src/services/illustrationMatching.ts`
- `$manle-database-workflow` before writing migrations
- `$manle-pdf-autofill` when comparing profile mappings to generator upload
  behavior

Do not read or search `node_modules`, `dist`, `.vite`, generated output, or raw
database dumps.

## Workflow

1. Intake PDFs and identify candidate profile groups by carrier, product,
   product type, and layout.
2. Produce the required outcome tables from
   `docs/agents/illustration-profile-codex-training.md`:
   - PDF intake
   - profile identity
   - fingerprints
   - field mappings
   - projection mappings
   - normalized sample extracts
   - review gate summary
3. Stop for user review before writing migration SQL.
4. After approval, write an additive, idempotent migration that imports only the
   approved profiles/mappings.
5. Do not run `bun run db:migrate` unless the user explicitly approves running
   the migration against a specific database.

## Mapping Rules

- Keep mappings compatible with the existing runtime strategy enums.
- Required runtime fields must be evidence-backed and replayable.
- Use `constant` for carrier/product/productType only when fingerprints already
  identify the published profile.
- Use `manual` only to document draft-only mappings that runtime should not use.
- Keep evidence snippets short and page-scoped.
- Mark uncertain or non-replayable rows as `needs_review`; do not guess.
- Do not persist raw PDF text in migrations.

## Review Output

The response before migration must make review easy:

- List one profile per carrier/product/type.
- Show required fields and whether they replay.
- Show fingerprints and why they are stable.
- Show projection rows for IUL profiles when present.
- Call out blocked fields, ambiguous labels, layout drift, and missing samples.

## Migration Rules

- Use the existing tables from `012_illustration_profiles.sql`.
- Keep migrations additive and idempotent.
- Prefer one migration per approved batch of profiles.
- Use deterministic profile identity lookup.
- Publish only after explicit user approval; otherwise import as draft.
- Never drop, truncate, or rewrite existing profile data unless the user
  approves that specific destructive plan.

## Validation

After changing agent artifacts, run:

- `node scripts/validate-manle-skills.mjs`

After TypeScript changes, run the relevant package build. For migration-only
work, report whether `db:migrate` was skipped or approved and run.
