# ADR 0001: Preserve The DOM-Driven Generator

Status: Accepted

Date: 2026-05-18

## Context

The maintained generator in `fe/` is not a conventional React component tree.
React mounts `fe/src/template.html`, then `fe/src/initDomApp.ts` binds
imperative DOM behavior. Template IDs, classes, and `data-*` attributes are
therefore part of the runtime contract for event binding, render output,
persistence, PDF upload, editor controls, and export.

## Decision

Preserve the DOM-driven generator architecture for normal feature and bug-fix
work. Changes should trace controls from `template.html` to the owning modules
and update template, state, events, render, persistence, and styles together
when a behavior crosses those boundaries.

Large React refactors require an explicit user request and a separate migration
plan.

## Consequences

- Small changes can remain localized and predictable.
- Agents must treat DOM IDs/classes as API, not incidental markup.
- Visual/export changes need card-output awareness, not only sidebar UI checks.
- New app-wide state must be wired through existing owners rather than hidden in
  ad hoc DOM reads.

## References

- `AGENTS.md`
- `fe/AGENT_DIRECTORY.md`
- `.agents/skills/manle-fe-workflow/SKILL.md`
- `.agents/skills/manle-card-export-qa/SKILL.md`
