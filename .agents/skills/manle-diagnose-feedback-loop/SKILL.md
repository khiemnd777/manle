---
name: manle-diagnose-feedback-loop
description: Use when debugging MANLE bugs, regressions, failed builds/tests, inconsistent UI state, failing auth/profile/billing/admin flows, PDF parsing problems, export/layout defects, Docker/runtime issues, CI failures, logs, screenshots, or symptoms that need reproduce-hypothesize-fix-verify discipline.
---

# Manle Diagnose Feedback Loop

Use this skill for bug work and regressions. Keep the loop evidence-driven and
scoped to the owning package.

## Required Reading

Read:

- `AGENTS.md`
- `CONTEXT.md`
- The relevant package `AGENT_DIRECTORY.md`
- The package skill for the suspected owner

Use the narrowest source entry point from the package directory before broad
search.

## Loop

1. State the symptom in one sentence.
2. Locate the owner using the package `AGENT_DIRECTORY.md`.
3. Reproduce with the narrowest available command or code path.
4. Compare expected versus actual behavior.
5. Form one or two source-grounded hypotheses.
6. Add temporary instrumentation only if source inspection is insufficient.
7. Make the smallest coherent fix.
8. Add or update a regression test when a harness exists and risk justifies it.
9. Run validation that exercises the failing path.
10. Remove temporary instrumentation and report skipped checks.

## MANLE-Specific Checks

- FE state bugs: trace `template.html` ID, event binding, `state`, render, and
  persistence together.
- Account/profile bugs: check FE account state and backend API contract together.
- PDF bugs: check product detection, extracted fields, tabular maps, and stale
  map clearing.
- Export bugs: check active card selection, `exporting` class behavior,
  computed-style inlining, and hidden editor controls.
- Admin bugs: check `admin/src/api/client.ts`, backend route, service, and audit
  behavior.
- Billing bugs: check Paddle config, webhook verification, idempotency, tier
  mapping, and entitlement refresh.
- Quota bugs: check server authorization and database update atomicity.

## Validation Rules

- Use build/test commands from the affected package.
- Do not run browser automation, Chrome smoke tests, Vite preview, or built
  output preview unless the user specifically requested that verification.
- For PDF parser changes, use sample PDFs when available; otherwise document
  that sample-PDF verification was not possible.
- For CI/Docker failures, validate config locally where possible and report any
  skipped daemon, registry, SSH, or production checks.

## Report

Close with:

- root cause
- files changed
- validation run
- validation skipped
- residual risk, if any
