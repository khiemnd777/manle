# MANLE Handoff Format

Use this when pausing work, transferring context, or preparing a future agent to
continue without re-discovering the same facts.

## Template

```md
## Handoff

Goal:
What the user asked for and the current intended outcome.

Current state:
What is implemented, partially implemented, or only investigated.

Files changed:
- `path`: reason

Important findings:
- Concrete source facts, routes, DOM IDs, tables, or contracts.

Validation run:
- Command and result.

Validation skipped:
- Check and reason it was not run.

Risks:
- Contract, auth, billing, parser, visual, or deploy risks still open.

Next steps:
- Ordered, actionable tasks for the next agent.
```

## Rules

- Cite exact files and symbols, not only broad areas.
- Include package-level validation results.
- State whether browser/export/sample-PDF checks were run.
- Preserve unresolved questions and assumptions.
- Do not include secrets, tokens, raw production logs, or private credentials.
