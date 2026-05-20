---
name: manle-handoff
description: Use when summarizing or transferring MANLE work after a long session, partial implementation, investigation, review, failed attempt, context compaction risk, or before another agent continues the task, especially across FE/API/Admin/database/PDF/export/Docker/CI boundaries.
---

# Manle Handoff

Use this skill when the next agent needs to continue without repeating the same
discovery work.

## Required Reading

Read:

- `docs/agents/handoff.md`
- `git status --short`
- Relevant package `AGENT_DIRECTORY.md` files for touched areas
- Recent validation output from the current session, if available

## Handoff Rules

- Keep it factual and source-grounded.
- Cite changed files and important untouched files.
- Include exact commands run and whether they passed.
- State skipped validation explicitly.
- Preserve open questions, assumptions, and residual risk.
- Do not include secrets, tokens, production credentials, or raw private data.

## Required Sections

Use the template in `docs/agents/handoff.md` and include:

- goal
- current state
- files changed
- important findings
- validation run
- validation skipped
- risks
- next steps

## Special MANLE Notes

Always mention when applicable:

- whether browser QA was requested and run
- whether export PDF/PNG/JPG checks were run
- whether sample PDFs were available
- whether FE/API/Admin contract consumers were updated together
- whether database migrations were applied or only written
- whether Docker/CI checks were local-only or remote-verified
