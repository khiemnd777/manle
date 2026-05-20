# MANLE Domain Reference

Use this file for product vocabulary and cross-package contract context. Use the
package `AGENT_DIRECTORY.md` files for exact owning files and search anchors.

## Users And Auth

- Customer accounts use customer-facing auth endpoints and generator UI state.
- Internal system users use admin-console auth endpoints.
- Admin-only data mutations require backend role checks on every protected route.
- Frontend guards are display helpers only; they are not authority.

## Billing And Entitlements

- Paddle checkout may start in the browser, but durable access comes from server
  subscription state and verified webhooks.
- Tier configuration belongs in the backend/database, then flows to FE/Admin as
  display and authorization data.
- Export authorization must happen before html2canvas/jsPDF capture begins.
- Quota responses should return enough state for the UI to refresh display after
  login, signup, profile update, checkout callback, and export authorization.

## Generator State

- Shared client/risk fields: name, age, gender, state, risk class.
- Shared agent/footer fields: agent firm and agent list.
- IUL-specific fields: face amount, monthly premium, premium years, rate,
  drag-tune, and PDF tabular cash-value maps.
- Term-specific fields: term face amount, term monthly premium, and term length.
- Header, logo, style, and living-benefit editors have product-specific state
  where the current app separates IUL and Term Life.

## PDF Parsing

- Filename parsing is a hint. PDF content wins when both are present.
- Product detection must use conservative markers, not one ambiguous number.
- Tabular detail rows can override projected cash values only when rows are
  extracted cleanly.
- Manual policy edits after upload must clear stale PDF-derived maps.

## Admin Operations

- Admin screens are operational tools: dense tables, filters, compact forms,
  dialogs, explicit loading/error/empty states.
- Prefer reversible status changes over destructive deletes.
- Admin mutations should produce audit entries with actor, action, target, time,
  and metadata.

## Validation Expectations

- `cd fe && bun run build` after FE source, template, or style changes.
- `cd api && bun run build` after API TypeScript changes.
- `cd admin && bun run build` after admin source changes.
- Migration/database work should include migration status or repository tests
  when available.
- Browser, Chrome, preview, and export smoke tests run only when the user
  specifically requests them or when the active task explicitly permits them.
