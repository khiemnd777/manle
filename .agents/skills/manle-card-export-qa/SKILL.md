---
name: manle-card-export-qa
description: Use when changing MANLE card layout, CSS, rendered output, header/style/living-benefit editors, html2canvas image capture, jsPDF export, PNG/JPG/PDF buttons, visual QA, or browser verification for the IUL and Term Life cards.
---

# Manle Card Export QA

Use this skill for visual, layout, card-rendering, and export work in `fe/**`.

## Required Reading

Read these before editing:

- `AGENTS.md`
- `fe/AGENTS.md`
- `fe/src/template.html`
- `fe/src/styles.css`
- `fe/src/render.ts`
- `fe/src/exportCard.ts`
- related editor modules when the change touches header, style, or living-benefit controls

Do not read or search `node_modules/`, `dist/`, or `.vite/` unless the user explicitly asks about dependency internals, built output, or cache behavior.

Also load `$manle-fe-workflow` for implementation changes that cross template, state, render, and persistence.

## Visual Surface Map

- `template.html` defines sidebar controls, IUL card, Term Life card, IDs, and editor hooks.
- `styles.css` owns sidebar layout, card dimensions, tab visibility, export styling, and responsive behavior.
- `render.ts` writes client, policy, risk, cash-value, footer, and term-card data into the DOM.
- `exportCard.ts` captures the currently visible card with `html2canvas` and writes PDF with `jsPDF`.
- `livingBenefitColumns.ts` and `livingBenefitFormat.ts` manage editable living-benefit card content and columns.
- `headerEditor.ts` and `styleEditor.ts` persist user-edited logos, header text, colors, and fonts.

## Export Rules

- `exportCardImage(format)` must capture the active card only: `cardOut` for IUL and `cardOutTerm` for Term Life.
- Keep `repairAllLivingBenefitFormats()` before capture so editable living-benefit text exports cleanly.
- Preserve the `exporting` class behavior that suppresses hover/focus artifacts.
- Preserve computed-style inlining unless replacing it with a verified equivalent that works with CSS variables.
- PDF output should fit a letter-sized page with margins and avoid clipping.
- PNG/JPG output should trigger a download from the rendered canvas without changing app state.

## QA Workflow

For visual or export changes:

1. Run `cd fe && bun run build`.
2. Start the Vite dev server from `fe/`.
3. Use the browser to inspect both IUL and Term Life tabs.
4. Check desktop and narrow viewport layouts when sidebar/card CSS changed.
5. Exercise PDF, PNG, and JPG buttons when `exportCard.ts` or card CSS changed.

Look specifically for:

- clipped text inside cards or buttons
- overlapping bilingual labels
- stale values after switching tabs
- hidden elements appearing in export
- cursor, focus ring, hover state, or editor controls appearing in export
- broken logos or missing MUI icon hydration

## Styling Rules

- Keep card output dense, professional, and print-friendly.
- Use existing classes and CSS variables before adding new visual systems.
- Do not put generated screenshots or exported files in the repo unless the user asks.
- Do not edit `fe/dist`; it is build output.

## Reporting

When browser or export verification cannot be run, say exactly which validation was skipped and why.
