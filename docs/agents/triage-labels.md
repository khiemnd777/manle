# MANLE Triage Labels

Use these labels in plans, issue slices, handoffs, and review notes. They are
local agent language, not a required external issue tracker.

## Areas

- `area:fe`: generator UI, DOM template, state, render, persistence, account UI.
- `area:api`: backend routes, services, config, auth, Paddle, entitlement.
- `area:admin`: admin-console views, API client, forms, tables, guards.
- `area:db`: migrations, schema, SQL, repository behavior, seed data.
- `area:pdf`: PDF upload, extraction, parser, auto-fill, PDF-derived state.
- `area:export`: html2canvas/jsPDF, PDF/PNG/JPG output, card layout capture.
- `area:devops`: Docker, compose, env files, healthchecks, runtime wiring.
- `area:cicd`: GitHub Actions, deployment, image publishing, rollback.
- `area:docs`: agent docs, ADRs, skills, onboarding maps.

## Risk

- `risk:auth`: identity, sessions, passwords, cookies, role checks.
- `risk:billing`: Paddle state, subscription access, price IDs, promotions.
- `risk:quota`: export authorization, race conditions, usage counters.
- `risk:data`: migrations, data loss, backfills, irreversible changes.
- `risk:contract`: FE/API/Admin request or response drift.
- `risk:visual`: card layout, print/export fidelity, mobile overlap.
- `risk:parser`: false extraction, invented illustration values, stale maps.
- `risk:deploy`: production rollout, env secrets, healthchecks, rollback.

## Severity

- `P0`: production outage, auth bypass, data loss, billing access breakage.
- `P1`: core paid/user workflow broken or high-risk security regression.
- `P2`: important workflow degraded with clear workaround.
- `P3`: small defect, cleanup, documentation, or narrow polish.

## Work Type

- `type:bug`
- `type:feature`
- `type:refactor`
- `type:test`
- `type:docs`
- `type:infra`
- `type:security`

## Done Signal

Each slice should name:

- owning package or packages
- exact files or source anchors to inspect first
- behavior change
- validation command
- skipped validation, if any
- handoff note when follow-up remains
