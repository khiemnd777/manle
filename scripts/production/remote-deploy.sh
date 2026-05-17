#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io}"

: "${IMAGE_OWNER:?IMAGE_OWNER is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

if [ "${PROD_SUDO_PASSWORD_STDIN:-}" = "1" ] && [ -z "${PROD_SUDO_PASSWORD:-}" ]; then
  IFS= read -r PROD_SUDO_PASSWORD || true
fi

run_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if [ -n "${PROD_SUDO_PASSWORD:-}" ]; then
    printf '%s\n' "$PROD_SUDO_PASSWORD" | sudo -S -p '' "$@"
    return
  fi

  sudo "$@"
}

docker_compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  run_sudo env \
    "IMAGE_REGISTRY=$IMAGE_REGISTRY" \
    "IMAGE_OWNER=$IMAGE_OWNER" \
    "IMAGE_TAG=$IMAGE_TAG" \
    docker compose "$@"
}

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

env_value() {
  key="$1"
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

PROD_HEALTHCHECK_URL="${PROD_HEALTHCHECK_URL:-$(env_value PROD_HEALTHCHECK_URL)}"

echo "Deploying MANLE image tag $IMAGE_TAG from $IMAGE_REGISTRY/$IMAGE_OWNER"

docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null
docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres redis
docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api bun run db:migrate
docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

if [ -n "$PROD_HEALTHCHECK_URL" ]; then
  i=1
  while [ "$i" -le 30 ]; do
    if curl -fsS "$PROD_HEALTHCHECK_URL" >/dev/null; then
      echo "Healthcheck passed: $PROD_HEALTHCHECK_URL"
      docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
      exit 0
    fi
    echo "Waiting for healthcheck ($i/30): $PROD_HEALTHCHECK_URL"
    i=$((i + 1))
    sleep 5
  done
  echo "Healthcheck failed: $PROD_HEALTHCHECK_URL" >&2
  docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
  exit 1
fi

i=1
while [ "$i" -le 30 ]; do
  if docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T api bun -e "const r = await fetch('http://127.0.0.1:8787/health'); if (!r.ok) process.exit(1);" >/dev/null 2>&1; then
    echo "Internal API healthcheck passed"
    docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    exit 0
  fi
  echo "Waiting for internal API healthcheck ($i/30)"
  i=$((i + 1))
  sleep 5
done

echo "Internal API healthcheck failed" >&2
docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
exit 1
