# admin/AGENTS.md

## Admin Frontend Scope

This directory contains the MANLE admin console built with React, TypeScript, Vite, and Bun.

`AGENT_DIRECTORY.md` is the detailed Codex feature directory for admin views, API client methods, form fields, backend endpoint contracts, and CSS anchors. Read it before broad search when locating an admin behavior.

## Agent Ignore Rules

- Do not read or edit `node_modules/`, `dist/`, `.vite`, or generated output.
- Keep Paddle secrets, database URLs, and session secrets out of frontend code.

## Commands

- `bun install` only when dependencies are missing or `package.json` changed.
- `bun run dev -- --host 127.0.0.1 --port 5174` for local admin QA.
- `bun run build` for TypeScript and production build validation.

## Working Rules

- Start with `AGENT_DIRECTORY.md` for view/API/client/style ownership and exact search anchors before scanning the package broadly.
- Backend `/api/admin/**` is the authority for role checks and mutations.
- Use `credentials: 'include'` for admin session cookies.
- Keep admin screens dense and operational: tables, filters, compact forms, status badges.
- Show loading, empty, error, and unauthorized states.
- Prefer disable/deactivate flows over destructive delete UI.
