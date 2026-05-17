COMPOSE := docker compose --env-file .env -f compose.yaml
COMPOSE_PROD := docker compose --env-file .env.prod -f compose.prod.yaml

.PHONY: env up down stop restart log ps prod-config prod-ps sync-secrets

env:
	@test -f .env || cp .env.example .env

up: env
	$(COMPOSE) up -d --build

down: env
	$(COMPOSE) down

stop: env
	$(COMPOSE) stop

restart: env
	$(COMPOSE) down
	$(COMPOSE) up -d --build

log: env
	$(COMPOSE) logs -f --tail=200

ps: env
	$(COMPOSE) ps

prod-config:
	$(COMPOSE_PROD) config

prod-ps:
	$(COMPOSE_PROD) ps

sync-secrets:
	scripts/sync-github-secrets.sh .github-secrets.env
