---
name: manle-pdf-autofill
description: Use when changing MANLE PDF upload or auto-fill behavior, including Transamerica IUL or Term Life illustration parsing, filename extraction, PDF.js loading, tabular cash-value rows, field application, upload-zone state, or PDF-derived cache invalidation.
---

# Manle PDF Autofill

Use this skill for `fe/src/pdf.ts`, `fe/src/runtime.ts`, PDF upload UI, extracted illustration data, and auto-fill side effects.

## Required Reading

Read these before editing:

- `AGENTS.md`
- `fe/AGENTS.md`
- `fe/src/pdf.ts`
- `fe/src/runtime.ts`
- `fe/src/core.ts`
- `fe/src/render.ts`
- `fe/src/persistence.ts` when extracted values must persist

Do not read or search `node_modules/`, `dist/`, or `.vite/` unless the user explicitly asks about dependency internals, built output, or cache behavior.

Also load `$manle-fe-workflow` when the change crosses form fields, render output, state, or tab behavior.

## Parser Pipeline

Preserve this flow:

1. `parseFilename(file.name)` extracts useful fields from common agent file naming conventions.
2. `extractPdfData(file)` loads PDF.js, reads page text, and extracts tabular detail rows when present.
3. `parsePdfText(text)` extracts fields from PDF content.
4. `mergeExtracted(fromFile, fromContent)` lets content override filename-derived values.
5. `applyExtracted(data, targetTab)` writes form values, formats currency fields, updates agent data, and switches tab when product type is detected.
6. `handlePdfUpload(file, forTab)` owns upload UI state, exact CSV/PV/DB maps, render refresh, and success/error messaging.

Keep each responsibility in the existing function unless there is a clear reason to split it.

## Product Rules

- IUL markers include `FFIUL`, `Indexed Universal Life`, `TABULAR DETAIL`, and `Index Account`.
- Term Life markers include `Trendsetter`, `Level Term Period`, and `Guaranteed Level Term`.
- IUL uploads write `faceAmount` and `monthlyPrem`.
- Term uploads write `termFaceAmount`, `termMonthlyPrem`, and `termLength`.
- If a PDF is identified as Term Life, switch to the Term Life tab. If it is identified as IUL, switch to the IUL tab.
- Do not auto-fill DOB into a field. The current behavior computes age from DOB only as a fallback.

## Tabular Detail Rules

- Tabular rows are used to populate exact `state.actualCSV`, `state.actualPVMap`, and `state.actualDBMap` maps by age.
- When valid tabular rows are extracted, set the non-guaranteed rate field to `7.25`.
- If no rows are extracted, clear PDF-derived maps rather than keeping stale data.
- Treat duplicate bold-rendered rows as duplicates and dedupe by year.
- Death benefit sanity checks should remain conservative.

## Regex And Extraction Rules

- Prefer narrow, labeled patterns before broad fallback regexes.
- Preserve existing filename formats when adding new ones.
- Keep state normalization through `normalizeState()`.
- Keep phone normalization through `formatPhone()`.
- Do not invent policy values or assume a product type from a single ambiguous number.
- When adding a pattern, ensure it does not capture nearby labels, years, issue age, or premium fields accidentally.

## Validation

Run `cd fe && bun run build` after TypeScript changes.

When sample PDFs are available, verify both upload zones in the browser:

- IUL PDF fills client, policy, agent, and cash-value rows.
- Term Life PDF fills term-specific fields and switches to the Term Life card.
- Manual policy edits after upload clear PDF-derived cash-value maps.

When no sample PDF is available, validate parser changes with focused reasoning over representative strings and note that browser/PDF verification was not run.
