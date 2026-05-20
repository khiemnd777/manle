---
name: manle-docker-workflow
description: Use when creating, debugging, or modifying MANLE Docker runtime files, including `compose.yaml`, production compose files, Dockerfiles, `.dockerignore`, `.env.example`, Makefile Docker commands, container healthchecks, local development stack behavior, or production container deployment layout for API, frontend, admin, Postgres, Redis, and Paddle-related environment variables.
---

# Manle Docker Workflow

## Overview

Use this skill for Docker changes in the MANLE repository. Keep the local development stack fast and source-mounted, while keeping any production stack explicit, immutable, secret-safe, and deployable from GitHub Actions.

## Required Reading

Read these before editing Docker-related files:

- `AGENTS.md`
- `compose.yaml`
- `Makefile`
- `.env.example`
- the target package Dockerfile: `api/Dockerfile`, `fe/Dockerfile`, or `admin/Dockerfile`
- the target package `package.json`
- the package skill when changing package behavior: `$manle-api-workflow`, `$manle-fe-workflow`, or `$manle-admin-workflow`
- `$manle-diagnose-feedback-loop` when debugging container startup, healthcheck, env, or local/prod runtime drift

Do not read or edit `node_modules`, `dist`, `.vite`, image layers, container volumes, or generated build output.

## Environment Model

The current `compose.yaml` is the local development stack:

- `postgres` and `redis` use named volumes and healthchecks.
- `api` mounts `./api:/app`, uses `api_node_modules`, runs migrations, then `bun run dev`.
- `fe` mounts `./fe:/app`, uses `fe_node_modules`, and runs Vite on port `5173`.
- `admin` mounts `./admin:/app`, uses `admin_node_modules`, and runs Vite on port `5174`.
- `Makefile` wraps `docker compose --env-file .env -f compose.yaml`.

Keep production separate from local development:

- Do not use source bind mounts in production.
- Do not run Vite dev servers or `bun --watch` in production.
- Do not bake `.env`, Paddle secrets, database URLs, SSH keys, or tokens into images.
- Use explicit production origins, `COOKIE_SECURE=true`, and production Paddle values when billing is enabled.
- Use named volumes or managed services for Postgres/Redis, and preserve backup/restore expectations before changing volume names.
- Treat Vite `VITE_*` values as build-time values unless a runtime config layer exists.

## Change Workflow

1. Classify the change as local-only, production-only, or shared.
2. Keep related files synchronized: compose service definitions, Dockerfiles, `.dockerignore`, `.env.example`, Makefile commands, package scripts, and CI/deploy workflows.
3. Preserve local developer ergonomics: `make env`, `make up`, `make log`, `make ps`, `make restart`, `make stop`, and `make down` should remain accurate.
4. Keep API, frontend, and admin origins aligned:
   - browser-facing Vite apps need the public API base URL
   - API CORS must allow the frontend and admin origins
   - cookie settings must match HTTP versus HTTPS
5. Add or update healthchecks when deployment automation needs readiness checks. The API exposes `GET /health`.
6. Prefer immutable production images or a clearly versioned production compose file over rebuilding untracked source on the server.
7. Document new required environment variables in `.env.example`; never put real values there.

## Dockerfile Rules

- Keep Bun version changes intentional and consistent across package Dockerfiles.
- Use `bun install --frozen-lockfile` when a package has a lockfile.
- For production API images, prefer a build/start path over `bun run dev`.
- For production frontend/admin images, build static assets with the correct `VITE_API_BASE_URL` and serve them with an explicit static server or reverse proxy pattern.
- Run database migrations deliberately. Do not hide risky migration behavior inside every long-running app restart unless that is an explicit deployment policy.
- Keep `.dockerignore` broad enough to exclude `node_modules`, `dist`, `.vite`, local env files, logs, and editor artifacts.

## Validation

Run the narrowest validation that covers the change:

- `docker compose --env-file .env -f compose.yaml config` for local compose changes.
- the equivalent production compose `config` command when a production compose file exists.
- `cd api && bun run build` for API Docker/runtime script changes.
- `cd fe && bun run build` for frontend Docker/runtime script changes.
- `cd admin && bun run build` for admin Docker/runtime script changes.
- Run `make up` or browser QA only when the user specifically asks for runtime/browser verification.

Report any skipped Docker daemon, production, or browser validation explicitly.
