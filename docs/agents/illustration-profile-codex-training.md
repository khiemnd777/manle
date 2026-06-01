# MANLE Illustration Profile Codex Training

Use this reference when Codex is asked to analyze insurance illustration PDFs and
produce database-ready Illustration Profiles without using the admin OpenAI
training route.

This workflow does not remove or deprecate OpenAI training code. It is an
operator workflow that temporarily ignores the OpenAI admin-training path and
uses Codex, preferably the requested Codex `gpt-5.5` model when available, to
prepare reviewed mappings for migration import.

## Goal

Produce a reviewed, deterministic profile package that can be inserted into the
existing illustration profile tables:

- `illustration_profiles`
- `illustration_profile_versions`
- `illustration_profile_fingerprints`
- `illustration_profile_field_mappings`
- `illustration_profile_projection_mappings`
- optionally `illustration_training_examples` and `illustration_extraction_runs`
  when the import should preserve sample/audit history

The runtime extraction path remains deterministic: it matches a published
profile by fingerprints, then applies approved field and projection mappings.

## Required Context

Before analyzing PDFs or writing a migration, read:

- `AGENTS.md`
- `CONTEXT.md`
- `api/AGENT_DIRECTORY.md`
- `api/db/migrations/012_illustration_profiles.sql`
- `api/src/types/illustration.ts`
- `api/src/services/illustrationMappingEngine.ts`
- `api/src/services/illustrationRuntimeExtraction.ts`
- `api/src/services/illustrationMatching.ts`

For frontend upload behavior, also read:

- `fe/AGENT_DIRECTORY.md`
- `fe/src/pdf.ts`

## Operating Rules

- Do not call the OpenAI admin training route for this workflow.
- Do not remove or edit OpenAI training code unless the user explicitly asks for
  code changes.
- Do not invent insurance illustration values. If the PDF evidence is unclear,
  mark the field `needs_review`.
- Prefer PDF text evidence over filename evidence. Filename parsing is only a
  fallback or cross-check.
- Every proposed scalar mapping needs evidence: page number, snippet, sample
  value, and confidence.
- Product detection must use multiple conservative markers when possible.
- Required runtime fields must replay from mappings before publish:
  `client.fullName`, `policy.faceAmount`, and either `policy.monthlyPremium`
  for IUL or `policy.termLength` for Term.
- Migrations are written only after the user reviews and approves the outcome
  tables.
- Do not run `bun run db:migrate` or change production database state unless the
  user explicitly approves that execution.
- Keep raw PDF text out of migrations. Store short evidence snippets only.

## Workflow

### 1. Intake PDFs

Create an intake table before mapping:

| PDF | Product Guess | Filename Signals | Content Signals | Pages Reviewed | Status |
| --- | --- | --- | --- | --- | --- |
| `<file name>` | `iul` or `term` | `<amount/premium/pay/risk hints>` | `<carrier/product markers>` | `<page range>` | `ready/needs_review/blocked` |

If multiple PDFs share the same carrier/product/form, treat them as samples for
one profile. If the product, form, or layout changes materially, split them into
separate profiles.

### 2. Extract Profile Identity

Output one identity row per proposed profile:

| Profile Key | Carrier | Product | Product Type | Confidence | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `<carrier>::<product>::<type>` | `<carrier>` | `<product>` | `iul/term` | `0.00-1.00` | `p<page>: <snippet>` | `<review notes>` |

Use the database identity constraint as the profile key:
`lower(carrier), lower(product_name), product_type`.

### 3. Propose Fingerprints

Fingerprints determine whether runtime should use a profile. Include required
carrier and non-carrier fingerprints.

| Profile Key | Type | Strategy | Value | Page | Required | Weight | Confidence | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<profile key>` | `carrier/product/form/version/text/regex/layout` | `contains/equals/regex/normalized_contains` | `<match text>` | `<page>` | `true/false` | `1.0` | `0.00-1.00` | `<snippet>` | `<risk>` |

Rules:

- At least one required `carrier` fingerprint.
- At least one required non-carrier fingerprint, usually `product`, `form`, or
  `text`.
- Prefer stable form/product phrases over case-specific values like client name,
  age, premium, face amount, or agent.
- Avoid broad phrases that may match unrelated carrier products.

### 4. Propose Field Mappings

Use only source strategies supported by runtime:

- `label_value`
- `regex`
- `table_cell`
- `filename`
- `constant`
- `manual` only for documentation or draft-only rows that will not be used at
  runtime

Output a field mapping table:

| Profile Key | Field Path | Strategy | Selector JSON | Transform JSON | Required | Min Confidence | Sample Value | Evidence | Replay Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<profile key>` | `client.fullName` | `label_value` | `{"label":"Insured","pageHint":1}` | `{}` | `true` | `0.8` | `<value>` | `p1: <snippet>` | `passed/needs_review` | `<risk>` |

Supported field paths are defined in `IllustrationFieldPath`:

- `carrier`
- `productName`
- `productType`
- `client.fullName`
- `client.age`
- `client.gender`
- `client.state`
- `client.riskClass`
- `policy.faceAmount`
- `policy.monthlyPremium`
- `policy.premiumMode`
- `policy.illustratedRate`
- `policy.payYears`
- `policy.termLength`
- `agent.name`
- `agent.phone`

Mapping guidance:

- Use `constant` for profile identity fields only when the matched profile has
  already proved carrier/product/type through fingerprints.
- Use `regex` when labels are inconsistent but the surrounding text is stable.
- Use `label_value` when the label/value relation is stable across samples.
- Use `filename` only for values that reliably appear in the file naming
  convention and are not present in PDF text.
- Currency fields need `{"currency":true}` when extraction could include `$`,
  commas, or labels.
- Illustrated/current rate fields need `{"percent":true}` and must capture the
  visible PDF percentage, such as `7.80%`. Do not hard-code carrier/product
  rate defaults in mappings, code, or migrations.
- When a projection header shows guaranteed, alternate, and current rates in one
  text line, map the rate under `CURRENT PROJECTIONS`; do not capture the first
  `Interest Rate` value in that row.
- Gender fields need `{"gender":true}` when source text can be `Male/Female`.
- Phone fields need `{"phone":true}`.

### 5. Propose Projection Mappings

Projection mappings are most important for IUL tabular rows. Term profiles often
have no projection mappings.

Output a projection mapping table:

| Profile Key | Projection Key | Strategy | Row Selector JSON | Column Mappings JSON | Value Mappings JSON | Transform JSON | Required | Min Confidence | Sample Rows | Replay Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<profile key>` | `iul_tabular_detail` | `table` | `{"pageHint":5,"regex":"..."}` | `{"age":"...","cashValue":"...","deathBenefit":"..."}` | `{}` | `{"currency":true}` | `false` | `0.8` | `age 65: cash ...` | `passed/needs_review` | `<risk>` |

Runtime projection extraction currently builds rows from matching lines and
named regex captures or per-field regexes in `columnMappings`/`valueMappings`.
The safest row regex uses named capture groups such as:

```regex
^(?<year>\d+)\s+(?<age>\d+)\s+(?<policyValue>[\d,]+)\s+(?<cashSurrenderValue>[\d,]+)\s+(?<deathBenefit>[\d,]+)
```

Only mark projections `publishable` when sample rows replay to the same ages and
values shown in the PDF evidence.

### 6. Produce Normalized Sample Extracts

For each PDF, include the normalized extract that runtime should produce:

```json
{
  "carrier": "",
  "productName": "",
  "productType": "iul",
  "client": {
    "fullName": "",
    "age": null,
    "gender": null,
    "state": "",
    "riskClass": ""
  },
  "policy": {
    "faceAmount": null,
    "monthlyPremium": null,
    "premiumMode": "monthly",
    "payYears": null,
    "termLength": null
  },
  "projections": [],
  "agent": {
    "name": "",
    "phone": ""
  }
}
```

Use `null` or omit optional values when evidence is absent. Do not fill values
from assumptions.

### 7. Review Gate

Before writing a migration, present a review summary:

| Profile Key | Required Fields Passed | Fingerprints Ready | Projections Ready | Suggested Status | Blocking Issues |
| --- | --- | --- | --- | --- | --- |
| `<profile key>` | `yes/no` | `yes/no` | `yes/no/not_applicable` | `publish/draft/blocked` | `<issues>` |

Suggested statuses:

- `publish`: required fields and fingerprints are stable, and projection rows
  replay when needed.
- `draft`: identity is clear but at least one optional mapping or sample needs
  operator review.
- `blocked`: required values are missing or PDF text extraction is too unstable.

Wait for explicit user approval before writing the migration.

### 8. Write Migration

After approval, create an additive migration under `api/db/migrations/**`.

Migration requirements:

- Wrap related inserts in a transaction when practical.
- Use deterministic profile lookup by `lower(carrier), lower(product_name),
  product_type`.
- Make the migration idempotent with `on conflict` or guarded inserts.
- Preserve existing tables and constraints.
- Insert a draft version when the user has not approved publish.
- Insert a published version and set profile `active` only when the reviewed
  outcome says `publish`.
- Do not insert raw PDF text. Use limited evidence snippets.
- Include comments only where they explain non-obvious mapping choices.

Recommended migration sections:

1. Upsert profile.
2. Ensure target version.
3. Delete/replace mappings for that target version only if this migration owns
   the version.
4. Insert fingerprints.
5. Insert field mappings.
6. Insert projection mappings.
7. Mark version `published` and profile `active` only when approved.

### 9. Validation

For documentation or migration authoring:

- Run `node scripts/validate-manle-skills.mjs` after changing agent artifacts.
- Review migration SQL for idempotency and rollback assumptions.
- Run `cd api && bun run build` if TypeScript code changes.
- Run `cd api && bun run db:migrate` only after explicit user approval and only
  against the intended database.

If sample PDFs were analyzed but not browser-tested, report that browser upload
verification was not run.
