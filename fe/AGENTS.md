# fe/AGENTS.md

## Frontend Scope

This directory is a Bun-managed React/Vite app. Source files live in `src/`; `dist/` and `node_modules/` are not source.

## Agent Ignore Rules

- Do not read, search, summarize, or edit `node_modules/`.
- Do not inspect `dist/` or `.vite/` unless the user specifically asks to debug built output or Vite cache behavior.
- Use source files in `src/`, config files, and package metadata as the default context.

## Source Map

- `AGENT_DIRECTORY.md` is the detailed Codex feature directory for this package. Read it before broad search when locating a feature, issue, DOM ID, parser behavior, export behavior, account flow, or API contract.
- `src/App.tsx` mounts `template.html`.
- `src/initDomApp.ts` runs one-time hydration and binding. Preserve ordering unless a traced bug requires a change.
- `src/core.ts` owns shared state, money/date helpers, product tab, and currency field IDs.
- `src/events.ts` binds form controls, tab buttons, reset/new-client, and export buttons.
- `src/render.ts` renders sidebar state into the IUL and Term Life cards.
- `src/pdf.ts` owns filename parsing, PDF text extraction, auto-fill, tabular rows, and upload-zone state.
- `src/runtime.ts` loads PDF.js and configures the worker.
- `src/account.ts` owns landing login/profile badge behavior, auth modal binding, customer profile section, billing checkout/portal actions, entitlement classes, and export authorization calls.
- `src/exportCard.ts` owns html2canvas/jsPDF/PNG/JPG export.
- `src/persistence.ts` owns localStorage load/save.
- `src/livingBenefitColumns.ts` and `src/livingBenefitFormat.ts` own editable living-benefit cards.
- `src/headerEditor.ts` and `src/styleEditor.ts` own user-editable logos, header text, colors, and fonts.
- `src/muiIcons.ts` hydrates Material icon placeholders.

## Editing Rules

- Start with `AGENT_DIRECTORY.md` for feature ownership and exact search anchors before scanning the package broadly.
- Keep `template.html` element IDs in sync with every `$('id')` lookup.
- For account/profile changes, keep `template.html`, `src/account.ts`, `src/styles.css`, and the backend account/profile API contract in sync.
- Profile UI must treat `/api/me`, `/api/entitlements`, and `/api/profile` as display/update contracts only; tier, quota, entitlements, role, and billing state remain server-authoritative.
- When adding a form field, wire template, event binding, render output, and persistence deliberately.
- Add currency field IDs to `CURRENCY_FIELD_IDS` so formatting is consistent.
- Call `refreshCustomDropdowns()` after programmatic select/input changes that use custom dropdowns.
- Clear PDF-derived maps when manual policy edits make uploaded illustration values stale.
- Keep contenteditable/export behavior clean; exported cards should not show cursors, hover states, focus rings, or editor controls.
- Do not add a router or a parallel component tree for isolated fixes.

## Product Rules

- IUL and Term Life share client, risk, agent, header/style, and footer concepts.
- IUL policy fields use `faceAmount`, `monthlyPrem`, `premYears`, `rate`, and `dragTune`.
- Term Life policy fields use `termFaceAmount`, `termMonthlyPrem`, and `termLength`.
- PDF parsing should distinguish IUL and Term Life before writing product-specific fields.
- Current behavior intentionally does not auto-fill DOB; it may derive age from DOB as a fallback.

## Validation

- Run `bun run build` after source changes.
- Use the browser for auth/profile badge behavior, profile form state, tab switching, upload zones, editor controls, and export changes.
- Verify both IUL and Term Life cards when shared rendering, styles, or form data changes.
