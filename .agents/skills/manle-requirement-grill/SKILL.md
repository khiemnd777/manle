---
name: manle-requirement-grill
description: Use when a MANLE request is ambiguous, underspecified, risky, or likely to change UI behavior, FE/API/Admin contracts, auth, billing, entitlements, PDF parsing, export output, database schema, Docker/CI deployment behavior, or architecture decisions before implementation.
---

# Manle Requirement Grill

Use this skill before editing when the request could branch into materially
different implementations or affect fragile MANLE contracts.

## Required Reading

Read only enough context to ask better questions:

- `AGENTS.md`
- `CONTEXT.md`
- The relevant package `AGENT_DIRECTORY.md`
- `docs/agents/domain.md` for vocabulary
- Existing ADRs in `docs/adr/**` when the request appears architectural

Then load the package skill that owns the likely change:

- `$manle-fe-workflow`
- `$manle-api-workflow`
- `$manle-admin-workflow`
- `$manle-database-workflow`
- `$manle-pdf-autofill`
- `$manle-card-export-qa`
- `$manle-docker-workflow`
- `$manle-github-actions-cicd`

## Clarify Only When It Matters

Ask questions when a reasonable assumption could cause:

- incorrect insurance illustration values
- auth, billing, tier, entitlement, or quota drift
- FE/API/Admin contract mismatch
- destructive database or production behavior
- visible card/export changes the user did not specify
- bilingual copy changes
- a large architecture shift away from existing patterns

If a conservative assumption is safe, state it and continue.

## Question Style

- Ask at most three concise questions.
- Include the consequence of each answer.
- Prefer source-grounded options over open-ended speculation.
- Do not ask about details that can be discovered from the repo.

## Decision Capture

When the answer becomes durable:

- Update `CONTEXT.md` for vocabulary or invariant changes.
- Add or update an ADR for architecture decisions.
- Add a slice note using `docs/agents/issue-slices.md` for multi-step work.

## Output Before Implementation

For substantial work, produce a short plan with:

- assumed goal
- affected packages
- package skill or skills to use next
- validation commands
- risks or explicit open questions
