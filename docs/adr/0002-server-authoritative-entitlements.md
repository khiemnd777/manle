# ADR 0002: Keep Entitlements Server-Authoritative

Status: Accepted

Date: 2026-05-18

## Context

MANLE combines customer login, Paddle billing, tier configuration, entitlement
display, and export authorization. Frontend state can be stale or user-modified,
so it cannot be the durable source of access decisions.

## Decision

Keep customer profile, billing, tier, quota, and entitlement authority on the
backend. The frontend and admin console may display returned state, but durable
access must be enforced by API routes and database-backed service logic.

Export work must call server authorization before capture begins. Paddle
webhooks are the durable billing source of truth and must be verified and
processed idempotently.

## Consequences

- UI state and localStorage remain display hints.
- API changes must update FE/Admin consumers and response types together.
- Profile email/password changes require current-password validation.
- Admin role checks belong on every protected backend route.
- Quota and billing tests should exercise service/API behavior, not only UI.

## References

- `api/AGENT_DIRECTORY.md`
- `fe/AGENT_DIRECTORY.md`
- `admin/AGENT_DIRECTORY.md`
- `.agents/skills/manle-api-workflow/SKILL.md`
- `.agents/skills/manle-database-workflow/SKILL.md`
