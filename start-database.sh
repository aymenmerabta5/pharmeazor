#!/usr/bin/env bash
set -euo pipefail

# start-database.sh — GhostInit quick Postgres starter (alternative to docker compose --env-file .env.local up -d)
# Container: ${PROJECT}_postgres by default, sanitized project name pharmeazor_postgres

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="pharmeazor"
ENV_FILE="$SCRIPT_DIR/.env.local"
CONTAINER="${PROJECT}_postgres"

# Load env safely — parse KEY=VALUE without executing command substitution
SAFE_ENV_KEYS="POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_PORT DATABASE_URL"
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value; do
    for allowed in $SAFE_ENV_KEYS; do
      if [ "$key" = "$allowed" ]; then
        export "$key=$value"
        break
      fi
    done
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" 2>/dev/null || true)
fi

DB_USER="${POSTGRES_USER:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-$PROJECT}"
DB_PASSWORD_RAW="${POSTGRES_PASSWORD:-}"

PLACEHOLDER_MASK="REPLACE_WITH_"
if [[ -z "$DB_PASSWORD_RAW" || "$DB_PASSWORD_RAW" == "$PLACEHOLDER_MASK"* || "$DB_PASSWORD_RAW" == "password" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)"
    echo "Generated random Postgres password (store in .env.local POSTGRES_PASSWORD)" >&2
  else
    echo "Error: openssl not found and POSTGRES_PASSWORD is not set. Install openssl or set a strong POSTGRES_PASSWORD in .env.local." >&2
    exit 1
  fi
else
  DB_PASSWORD="$DB_PASSWORD_RAW"
fi

ENGINE="docker"
if ! command -v docker >/dev/null 2>&1; then
  if command -v podman >/dev/null 2>&1; then
    ENGINE="podman"
  else
    echo "Error: neither docker nor podman found. Install one." >&2
    exit 1
  fi
fi

if ! $ENGINE info >/dev/null 2>&1; then
  echo "Error: $ENGINE daemon not running or $ENGINE info failed." >&2
  exit 1
fi

if $ENGINE ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^$CONTAINER$"; then
  if $ENGINE ps --format '{{.Names}}' 2>/dev/null | grep -q "^$CONTAINER$"; then
    echo "$CONTAINER already running."
    exit 0
  else
    echo "Starting existing container $CONTAINER..."
    $ENGINE start "$CONTAINER" >/dev/null
    echo "$CONTAINER started."
    exit 0
  fi
fi

if command -v nc >/dev/null 2>&1; then
  if nc -z localhost "$DB_PORT" 2>/dev/null; then
    echo "Warning: port $DB_PORT already in use, another Postgres may be running." >&2
  fi
fi

echo "Creating and starting $CONTAINER on port $DB_PORT (DB: $DB_NAME, user: $DB_USER)..."

# Postgres 18+ owns a versioned PGDATA below /var/lib/postgresql.
# Mount the parent so image upgrades preserve the intended layout.
$ENGINE run -d \
  --name "$CONTAINER" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "127.0.0.1:$DB_PORT:5432" \
  -v "${PROJECT}_postgres_data:/var/lib/postgresql" \
  postgres:18.6

echo "$CONTAINER created and started."
echo "DATABASE_URL=postgresql://$DB_USER:****@localhost:$DB_PORT/$DB_NAME"
echo "To view logs: $ENGINE logs -f $CONTAINER"
echo "To stop: $ENGINE stop $CONTAINER && $ENGINE rm $CONTAINER"