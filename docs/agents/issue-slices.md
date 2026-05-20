# MANLE Issue Slice Format

Use this format when converting a request, PRD, bug, or broad idea into
implementation slices. Keep slices independently reviewable and verify each
through the narrowest public interface.

## Slice Template

```md
## Slice N: Title

Labels: area:fe, risk:contract, type:feature

Goal:
One sentence describing the user-visible or operator-visible behavior.

Entry points:
- `fe/AGENT_DIRECTORY.md`: anchor
- `api/AGENT_DIRECTORY.md`: anchor

Scope:
- Files or modules likely owned by the slice.

Out of scope:
- Related work intentionally left for another slice.

Acceptance:
- Concrete behavior that must be true.

Validation:
- Exact command or manual check.

Dependencies:
- Prior slices or external setup.
```

## Slicing Rules

- Prefer vertical slices over package-only chores when behavior crosses FE/API.
- Put database migrations before API behavior that depends on them.
- Put API contract changes before FE/Admin consumers unless a mockable adapter
  already exists.
- Keep PDF parser changes separate from visual export QA unless the same bug
  needs both.
- Keep production deploy changes separate from application behavior changes.
- Include a rollback or recovery note for migrations and deploy slices.

## Common Slice Shapes

- `db -> api -> admin`: admin-managed data, entitlements, tiers, audit.
- `api -> fe`: customer account, profile, checkout, export authorization.
- `template -> events -> state -> render -> persistence`: generator field or
  control behavior.
- `pdf -> state -> render`: parser or auto-fill behavior.
- `styles -> export`: card layout or capture fidelity.
