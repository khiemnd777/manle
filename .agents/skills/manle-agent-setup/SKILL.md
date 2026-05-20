---
name: manle-agent-setup
description: Use when creating, auditing, or upgrading MANLE agent infrastructure, including `.agents/skills/**`, `.codex/agents/**`, `CONTEXT.md`, `docs/agents/**`, `docs/adr/**`, skill validation scripts, trigger wording, cross-skill references, and project-specific agent onboarding maps.
---

# Manle Agent Setup

Use this skill for MANLE agent infrastructure rather than product behavior.

## Required Reading

Read these before editing agent artifacts:

- `AGENTS.md`
- `CONTEXT.md` if present
- `docs/agents/domain.md` if present
- Existing `.agents/skills/*/SKILL.md`
- Existing `.codex/agents/*.toml` when subagent behavior changes

Do not read or edit generated output, dependency folders, or build caches.

## Skill Design Rules

- Keep `SKILL.md` focused on workflow and non-obvious MANLE rules.
- Put stable reference material in `docs/agents/**` or `docs/adr/**` instead of
  repeating it in every skill.
- Put only `name` and `description` in skill frontmatter.
- Make descriptions triggerable: include the task, affected area, and concrete
  examples of when to use the skill.
- Keep names lowercase, hyphenated, and under 64 characters.
- Prefer adding a narrow skill over making one generic skill handle unrelated
  work.

## MANLE Skill Layers

- Package workflow skills: FE, API, admin, database, Docker, CI/CD.
- Product-risk skills: PDF autofill, card export QA, auth/billing review.
- Meta-workflow skills: requirements, diagnosis, TDD, work slicing,
  architecture review, handoff, agent setup.

When a new skill overlaps an existing one, update trigger wording so the
specialized skill owns product details and the meta skill owns process.

## Documentation Rules

- `CONTEXT.md` stores stable project vocabulary and invariants.
- `docs/agents/domain.md` stores glossary and contract context.
- `docs/agents/triage-labels.md` stores local labels and severity language.
- `docs/agents/issue-slices.md` stores planning output format.
- `docs/agents/handoff.md` stores continuation format.
- `docs/adr/**` stores decisions that should survive across sessions.

Create an ADR when the agent learns a durable architecture decision, not for
routine implementation notes.

## Validation

Run the skill validation script when agent artifacts change:

- `node scripts/validate-manle-skills.mjs`

Also inspect the final diff for:

- missing or duplicate skill names
- stale `$manle-*` references
- overly broad descriptions
- duplicated large reference blocks
- instructions that conflict with `AGENTS.md`
