#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/sync-github-secrets.sh [-e environment] [-R owner/repo] [secrets-file]

Sync a local dotenv-like file to GitHub Actions environment secrets.

Defaults:
  environment: production
  secrets-file: .github-secrets.env

Supported file format:
  NAME=value
  NAME=@path/to/file

Lines starting with # are ignored. Use @path for multiline values such as SSH
private keys or PROD_ENV_FILE. Secret values are never printed.
USAGE
}

environment="production"
repo=""
secrets_file=".github-secrets.env"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -e|--environment)
      environment="${2:?Missing environment value}"
      shift 2
      ;;
    -R|--repo)
      repo="${2:?Missing owner/repo value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      secrets_file="$1"
      shift
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install and authenticate it before syncing secrets." >&2
  exit 1
fi

if [ ! -f "$secrets_file" ]; then
  echo "Missing secrets file: $secrets_file" >&2
  exit 1
fi

if [ -z "$repo" ]; then
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi

if [ -z "$repo" ]; then
  echo "Could not determine GitHub repository. Pass -R owner/repo." >&2
  exit 1
fi

gh api --method PUT "repos/${repo}/environments/${environment}" >/dev/null

count=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"

  if [ -z "$line" ] || [[ "$line" == \#* ]]; then
    continue
  fi

  if [[ "$line" == export[[:space:]]* ]]; then
    line="${line#export }"
  fi

  if [[ "$line" != *=* ]]; then
    echo "Invalid line in $secrets_file: $line" >&2
    exit 1
  fi

  key="${line%%=*}"
  value="${line#*=}"
  key="${key%"${key##*[![:space:]]}"}"

  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid secret name: $key" >&2
    exit 1
  fi

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  if [[ "$value" == @* ]]; then
    file_path="${value#@}"
    if [ ! -f "$file_path" ]; then
      echo "Missing file for $key: $file_path" >&2
      exit 1
    fi
    gh secret set "$key" --env "$environment" -R "$repo" < "$file_path" >/dev/null
  else
    printf '%s' "$value" | gh secret set "$key" --env "$environment" -R "$repo" >/dev/null
  fi

  echo "Synced $key to $repo environment $environment"
  count=$((count + 1))
done < "$secrets_file"

echo "Synced $count secret(s)."
