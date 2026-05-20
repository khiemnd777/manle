---
name: manle-work-slicing
description: Use when turning MANLE requirements, PRDs, bug clusters, architecture ideas, review feedback, deployment plans, or broad feature requests into ordered, independently verifiable work slices with affected packages, owners, dependencies, acceptance criteria, and validation plans.
---

# Manle Work Slicing

Use this skill before implementation when a request is too broad for one safe
patch or crosses multiple packages.

## Required Reading

Read:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/agents/issue-slices.md`
- `docs/agents/triage-labels.md`
- Relevant package `AGENT_DIRECTORY.md` files

Use `$manle-requirement-grill` first if the desired behavior is ambiguous.

## Slicing Principles

- Prefer vertical, user-visible slices over isolated technical chores.
- Keep database migrations before code that depends on new schema.
- Keep API contract changes before FE/Admin consumers unless an adapter lets the
  UI work independently.
- Keep visual export QA separate from parser/business logic unless the bug
  requires both.
- Keep production deployment separate from app behavior changes.
- Make every slice independently reviewable and validate it with one primary
  command or check.

## Output Format

Use `docs/agents/issue-slices.md`. For each slice include:

- title
- labels from `docs/agents/triage-labels.md`
- goal
- entry points
- scope
- out of scope
- acceptance criteria
- validation
- dependencies

## MANLE Cross-Package Patterns

- Customer account feature: `api` contract, `fe` account UI, optional `admin`
  visibility.
- Tier/entitlement feature: `db`, `api`, `admin`, optional `fe` gating.
- Export feature: `api` authorization, `fe` export flow, card/export QA.
- PDF feature: `fe/src/pdf.ts`, state/render, sample-PDF verification.
- Production rollout: Docker files, CI workflow, env example, healthcheck.

## Done Criteria

The plan is done when another agent can pick the first slice, know what to edit,
what not to edit, and how to verify it.
