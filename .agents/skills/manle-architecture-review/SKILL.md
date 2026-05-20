---
name: manle-architecture-review
description: Use when reviewing MANLE architecture quality, module boundaries, cross-package contracts, duplicated logic, state ownership, DOM contract drift, API/service/repository layering, admin/API mapper drift, PDF parser coupling, deployment design, or maintainability risks without immediately changing product behavior.
---

# Manle Architecture Review

Use this skill for review, not implementation. Lead with concrete findings and
source references.

## Required Reading

Read:

- `AGENTS.md`
- `CONTEXT.md`
- Relevant ADRs in `docs/adr/**`
- Relevant package `AGENT_DIRECTORY.md` files
- Package skills for the reviewed areas

## Review Targets

Look for:

- frontend code that bypasses the established template/event/state/render flow
- DOM IDs/classes changed without updating bindings, persistence, or render
- frontend logic trusting tier, quota, role, or entitlement state as authority
- API routes with missing auth, validation, service boundaries, or audit entries
- repository code returning shapes that drift from API contracts
- admin API client types that no longer match backend response shapes
- PDF parser regexes that are too broad or can invent policy values
- stale PDF-derived maps after manual edits
- export code that can capture hidden controls, hover state, or the wrong card
- migrations that risk data loss without a plan
- Docker/CI deployment paths that mix dev and production assumptions

## Review Output

Use code-review order:

1. Findings ordered by severity.
2. File and line references where possible.
3. Why the behavior is risky.
4. Minimum suggested fix.
5. Open questions or assumptions.
6. Short summary only after findings.

If there are no findings, say so clearly and list residual test or verification
gaps.

## Constraints

- Do not perform broad refactors during review.
- Do not edit files unless the user explicitly asks for fixes.
- Do not propose architecture that conflicts with accepted ADRs unless the
  recommendation includes an ADR update path.
