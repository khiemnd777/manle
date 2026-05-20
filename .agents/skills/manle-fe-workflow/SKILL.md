---
name: manle-fe-workflow
description: Use when implementing or modifying the MANLE frontend under fe/**, including React/Vite setup, DOM template wiring, landing/auth/profile badge and profile page behavior, state and render flows, sidebar controls, persistence, header or style editors, living-benefit editing, and IUL versus Term Life tab behavior.
---

# Manle FE Workflow

Use this skill for changes inside `fe/**`.

## Required Reading

Read these before editing:

- `AGENTS.md`
- `fe/AGENTS.md`
- `fe/package.json`
- `fe/src/initDomApp.ts`
- `fe/src/template.html`
- the target module or modules for the requested behavior

Do not read or search `node_modules/`, `dist/`, or `.vite/` while gathering context unless the user explicitly asks about dependency internals, build output, or cache behavior.

Load narrower skills when applicable:

- Use `$manle-pdf-autofill` for `fe/src/pdf.ts`, `fe/src/runtime.ts`, upload zones, PDF parsing, or auto-fill behavior.
- Use `$manle-card-export-qa` for `fe/src/styles.css`, `fe/src/exportCard.ts`, card layout, image/PDF export, or browser visual QA.
- Use `$manle-diagnose-feedback-loop` for frontend bugs, regressions, stale state, or inconsistent UI behavior.
- Use `$manle-tdd-vertical-slice` when adding regression coverage for frontend behavior.

## Architecture To Preserve

The app is a React/Vite shell that mounts one static HTML template and then binds DOM behavior imperatively:

- `App.tsx` injects `template.html` via `dangerouslySetInnerHTML`.
- `initDomApp.ts` is the one-time bootstrapper. Preserve initialization order unless the bug requires changing it.
- `core.ts` owns shared state, currency/date helpers, and current product tab.
- `events.ts` wires form controls and high-level buttons.
- `render.ts` mirrors form state into the IUL and Term Life cards.
- `persistence.ts` owns localStorage hydration and save scheduling.
- `account.ts` owns customer login/signup/logout, landing profile badge, profile section, billing checkout/portal actions, entitlement classes, and export authorization.
- `livingBenefitColumns.ts`, `livingBenefitFormat.ts`, `headerEditor.ts`, and `styleEditor.ts` own their specialized editor surfaces.

Prefer updating the existing owner module instead of adding cross-cutting code to unrelated files.

## Change Workflow

1. Trace the user-facing control from `template.html` IDs/classes to the binding module and render output.
2. Update template, state, event binding, render, and persistence together when the behavior crosses those boundaries.
3. For account/profile changes, update `template.html`, `account.ts`, `styles.css`, and the backend account API contract together. Keep the landing badge, profile page, and sidebar account panel synchronized from the same account state.
4. Keep IUL and Term Life behavior synchronized when shared client, risk, agent, header, style, or footer data changes.
5. Keep product-specific fields separate when the existing code already separates them, such as `faceAmount` versus `termFaceAmount`.
6. Run `bun run build` from `fe/` after TypeScript, template, style, or dependency changes.

## Form And State Rules

- When adding a currency input, add its ID to `CURRENCY_FIELD_IDS` in `core.ts` and format on input/blur.
- When a manual policy edit invalidates PDF-derived values, clear `state.actualCSV`, `state.actualPVMap`, and `state.actualDBMap`.
- When adding persistent UI state, update both save and load behavior in `persistence.ts`.
- When changing custom dropdowns, call `refreshCustomDropdowns()` after programmatic value changes.
- Do not store DOM nodes in shared state.

## UI Rules

- Preserve bilingual labels and client-card text unless the task explicitly changes copy.
- Profile and billing UI must display server-returned account, tier, quota, and entitlement state. Do not derive durable access from frontend-only state.
- Keep card output print/export friendly; avoid layout changes that only work in the sidebar.
- Do not add a second UI framework or a new routing layer.
- Do not edit generated output in `fe/dist`, dependency folders, or Vite cache folders.

## Validation

Use the smallest validation that covers the change:

- `cd fe && bun run build` for code changes.
- Browser smoke test for login/logout, profile badge visibility, profile form state, or account/profile API contract changes.
- Browser smoke test for tab switching, upload-zone behavior, editor controls, or visual changes.
- Export smoke test for PDF/PNG/JPG changes or any CSS change that affects the card.
