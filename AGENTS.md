# AGENTS.md

## Project Overview

This repository contains the MANLE client card generator plus the admin and billing foundation. The maintained generator app lives in `fe/` and uses React 19, TypeScript, Vite, Bun, PDF.js, html2canvas, and jsPDF. The backend API lives in `api/` and the admin console lives in `admin/`.

The app is not a conventional React component tree. React mounts `fe/src/template.html`, then `fe/src/initDomApp.ts` binds imperative DOM behavior. Treat template IDs and classes as part of the app contract.

## Repository Layout

- `fe/` is the client card generator source package.
- `api/` is the Bun + TypeScript backend API for customer/admin auth, customer profile self-service, Postgres persistence, subscriptions, tiers, promotions, entitlements, and quota authorization.
- `admin/` is the React + TypeScript + Vite admin console.
- `fe/AGENT_DIRECTORY.md`, `api/AGENT_DIRECTORY.md`, and `admin/AGENT_DIRECTORY.md` are Codex-facing feature directories. Use them before broad source searches when locating a feature, issue, DOM ID, route, or API contract.
- `fe/src/template.html` defines the landing page, auth/profile surfaces, sidebar, upload zones, IUL card, Term Life card, and editor hooks.
- `fe/src/*.ts` owns state, account/profile behavior, events, rendering, PDF parsing, persistence, export, and editor behavior.
- `fe/dist/`, `admin/dist/`, `api/dist/`, any `node_modules/`, and `.vite/` are generated or cache output. Do not edit them.
- `.agents/skills/` contains repo-local Codex skills.
- `.codex/agents/` contains project-scoped Codex subagent definitions.
- `CONTEXT.md` contains stable MANLE vocabulary, invariants, and agent-facing context.
- `docs/agents/` contains agent workflow references such as domain terms, triage labels, issue-slice format, and handoff format.
- `docs/adr/` contains durable architecture decisions.

## Agent Ignore Rules

- Do not read, search, summarize, or edit `node_modules/`.
- Exclude `node_modules`, `dist`, `.vite`, and other generated output from broad scans.
- Prefer commands such as `rg --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/.vite/**' ...` when searching the repo.

## Commands

Run commands from the package being changed:

- `bun install` only when dependencies are missing or `package.json` changed.
- `cd fe && bun run build` for generator validation.
- `cd api && bun run build` for backend API validation.
- `cd admin && bun run build` for admin console validation.
- `cd api && bun run db:migrate` to apply Postgres migrations against `DATABASE_URL`.
- `make up`, `make down`, `make stop`, `make restart`, and `make log` run the Docker stack from the root using root `.env`.
- `bun run dev -- --host 127.0.0.1` for browser QA only when the user specifically requests browser QA.
- `bun run preview` only when the user specifically requests checking the built `dist` output.

## Working Rules

- When a task asks to find, debug, map, or modify a feature under `fe/`, `api/`, or `admin/`, read the package's `AGENT_DIRECTORY.md` first and use its search anchors before broad `rg`.
- Read `CONTEXT.md` when a task needs MANLE product vocabulary, cross-package contracts, or architecture decisions.
- Read `fe/AGENTS.md` before changing files under `fe/`.
- Keep edits scoped to source files that own the requested behavior.
- Preserve the existing DOM-driven architecture unless the user explicitly asks for a larger refactor.
- Update template, events, render, persistence, and style together when a user-facing field or control crosses those boundaries.
- Update account/profile UI and API contracts together when changing customer login, signup, profile badge, profile page, session state, entitlements, or billing state.
- Customer profile self-service must stay server-authoritative: users may update their own name/email/password only through authenticated API endpoints, and email/password changes require current-password validation.
- Keep IUL and Term Life behavior synchronized for shared client, risk, agent, footer, style, and header flows.
- Keep product-specific policy fields separate where the current app separates them.
- Do not invent insurance illustration values. Preserve conservative parser and projection assumptions.
- Preserve bilingual English/Vietnamese UI text unless the task explicitly changes copy.
- Run `node scripts/validate-manle-skills.mjs` after changing `.agents/skills/**`, `.codex/agents/**`, `CONTEXT.md`, `docs/agents/**`, or `docs/adr/**`.

## Validation Expectations

- Run `cd fe && bun run build` after TypeScript, template, style, or dependency changes.
- Do not run smoke Chrome, headless Chrome, browser automation, web preview, or built-output preview unless the user specifically requests it.
- Use browser QA for visual, upload, export, or interactive behavior changes only when the user specifically requests it.
- When touching PDF parsing, verify with sample PDFs if available; otherwise document that sample-PDF verification was not possible.
- Report any skipped validation explicitly.
