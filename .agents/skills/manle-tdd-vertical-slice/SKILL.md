---
name: manle-tdd-vertical-slice
description: Use when implementing MANLE behavior test-first or adding regression coverage for high-risk changes across FE, API, admin, database, PDF parsing, export authorization, auth/profile, Paddle billing, entitlement, quota, or contract boundaries.
---

# Manle TDD Vertical Slice

Use this skill when tests should drive or protect the behavior. Keep tests close
to the public interface that users, routes, or services exercise.

## Required Reading

Read:

- `AGENTS.md`
- `CONTEXT.md`
- Relevant package `AGENT_DIRECTORY.md`
- Package skill for the owning area
- Existing tests or scripts near the behavior

## Test-First Workflow

1. Identify the externally visible behavior.
2. Find the narrowest test harness that can fail for the right reason.
3. Write or adjust a failing test before changing implementation when practical.
4. Implement the smallest source change.
5. Run the focused test.
6. Run the package build or broader tests that cover touched contracts.
7. Keep test fixtures conservative and domain-realistic.

## Public Interfaces By Area

- API: route handlers, service functions, repository calls, and response shapes.
- Database: migration result, constraints, repository behavior, and transactions.
- FE generator: state/render/persistence behavior through owning modules.
- PDF: parser functions and `applyExtracted` side effects.
- Export quota: API authorization before client capture.
- Admin: typed API client methods and view mutation flows.
- Docker/CI: config output, package build jobs, deployment command ordering.

## Test Data Rules

- Do not invent insurance illustration values beyond focused parser fixtures.
- Use representative strings for PDF parser unit tests when sample PDFs are not
  available.
- Avoid real Paddle secrets, production URLs, or real customer data.
- Keep tier and entitlement fixtures aligned with seed tier semantics.

## When A Harness Does Not Exist

Do not create a broad test framework just for one narrow fix. Prefer:

- a focused service/parser test if the package already supports tests
- package build validation
- a documented manual verification path
- an issue slice for adding harness support later

## Validation

Report the exact failing test introduced, the passing validation after the fix,
and any broader build/test command run.
