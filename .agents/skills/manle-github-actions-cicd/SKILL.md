---
name: manle-github-actions-cicd
description: Use when creating, debugging, or modifying MANLE GitHub Actions workflows, CI checks, Docker image publishing, production deployments, GitHub environments, deployment secrets, SSH/VPS rollout scripts, migration execution, health checks, rollback behavior, or any `.github/workflows/**` automation for promoting local-development changes to production.
---

# Manle GitHub Actions CI/CD

## Overview

Use this skill for CI/CD work in the MANLE repository. Keep local development on Docker Compose, and make production deployment through GitHub Actions reproducible, secret-safe, validated, and easy to roll back.

## Required Reading

Read these before editing CI/CD files:

- `AGENTS.md`
- existing `.github/workflows/**` files, if present
- `api/package.json`, `fe/package.json`, and `admin/package.json`
- `compose.yaml`, `Makefile`, and production compose/deploy files if they exist
- `$manle-docker-workflow` for Dockerfile, compose, image, or runtime changes
- package skills when the workflow validates package behavior: `$manle-api-workflow`, `$manle-fe-workflow`, `$manle-admin-workflow`
- `$manle-diagnose-feedback-loop` when debugging failed CI, deploy, migration, SSH, healthcheck, or rollback behavior
- `$manle-work-slicing` when turning a deployment plan into independently verifiable CI/CD slices

Do not read or edit `node_modules`, `dist`, `.vite`, workflow logs containing secrets, or generated build output.

## Pipeline Model

Use two clear environments:

- Development runs locally with `.env`, `compose.yaml`, and `make up`.
- Production deploys from GitHub Actions using GitHub Environments, repository or environment secrets, and an explicit deployment target.

Prefer this flow:

1. Pull request CI validates all changed packages.
2. Push to the production branch or tag runs the same validation.
3. Build immutable Docker images or production artifacts tagged by commit SHA.
4. Deploy the exact SHA that passed CI.
5. Run migrations as a deliberate deployment step.
6. Start or update production services.
7. Check `GET /health` on the API and fail the job if the rollout is unhealthy.

## Workflow Design Rules

- Keep CI and deploy jobs separate. Deploy jobs must depend on successful CI.
- Use `concurrency` for production deployments so only one rollout runs at a time.
- Use `permissions` with the smallest scope needed. Grant package write permission only to image publishing jobs.
- Use GitHub `environment: production` for deploy jobs and store production secrets there.
- Do not echo secrets, write secrets to build logs, or commit `.env` files.
- Prefer immutable image tags such as the full commit SHA. Use `latest`, `main`, or `production` only as moving aliases.
- Pin or deliberately choose action versions; verify major-version upgrades before changing them.
- Keep workflow path filters conservative. Shared Docker, API, FE, admin, package lock, and workflow files should trigger validation.
- Avoid deploying on pull requests from forks.

## Validation Jobs

Use the repo package commands:

- `cd api && bun run build`
- `cd fe && bun run build`
- `cd admin && bun run build`
- `docker compose --env-file .env -f compose.yaml config` when compose files change and a safe CI env file is available

Install dependencies from each package boundary. If package lockfiles are added or changed, keep CI install commands aligned with the package manager and lockfile state.

## Production Deploy Contract

When implementing production deployment, make the server contract explicit:

- Required secrets such as `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`, `PROD_DEPLOY_PATH`, and either a single `PROD_ENV_FILE` secret or individual production environment secrets.
- Required registry credentials if images are pushed to GHCR or another registry.
- A production compose file or deployment script that uses production images/artifacts, not local source bind mounts.
- A migration command with clear ordering and failure behavior.
- A healthcheck URL, usually the public API `/health` endpoint.
- A rollback path, such as redeploying the previous commit SHA or pulling the previous image tag.

If deploying over SSH, keep remote commands short, non-interactive, and idempotent:

- create or update the deployment directory
- write the production env file with restrictive permissions
- pull or load the exact image/artifact version
- run migrations once
- run `docker compose up -d --remove-orphans`
- verify service health
- prune only safe, old artifacts after a successful rollout

## Safety Checks

- Never add real secret values to workflow YAML, `.env.example`, or logs.
- Do not broaden deployment triggers without making the production branch/tag policy clear.
- Do not let a deploy job proceed after a failed build, failed migration, or failed healthcheck.
- Do not add destructive cleanup commands to production deploys unless the user explicitly approves the risk.
- Preserve local development commands while adding production automation.

## Validation

For workflow edits, validate as much as the local environment allows:

- Read the workflow YAML for syntax and trigger correctness.
- Run affected package builds locally when source or Docker build behavior changed.
- Run compose `config` validation for changed compose files.
- Use `gh` or GitHub connector checks only when the user asks to inspect remote CI status or GitHub is configured.
- Report any skipped remote Actions, registry, SSH, production, or browser validation explicitly.
