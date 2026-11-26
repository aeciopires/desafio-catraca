#!/usr/bin/env bash
# Shared helpers for Catraca scripts: colored messages and the standard error format.
# Error format (see docs/operations/troubleshooting.md):
#   [ERRO][<CODE>] <what failed>
#     Causa provável: <diagnosis>
#     Como resolver:  <concrete action>
#     Detalhes:       <command/log to investigate>

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_RST=''
fi

info() { printf '%s[INFO]%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok() { printf '%s[OK]%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%s[AVISO]%s %s\n' "$C_YLW" "$C_RST" "$*" >&2; }

# err CODE "what failed" "probable cause" "how to fix" ["details"]
err() {
  local code="$1" what="$2" cause="$3" fix="$4" details="${5:-}"
  {
    printf '%s[ERRO][%s]%s %s\n' "$C_RED" "$code" "$C_RST" "$what"
    printf '  Causa provável: %s\n' "$cause"
    printf '  Como resolver:  %s\n' "$fix"
    [ -n "$details" ] && printf '  Detalhes:       %s\n' "$details"
  } >&2
}

# die: print the error and exit non-zero.
die() {
  err "$@"
  exit 1
}

# Project root (scripts/..).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR

# Default values shared by every script (overridable through the environment).
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-catraca}"
export APP_PORT="${APP_PORT:-8080}"
export GRAFANA_PORT="${GRAFANA_PORT:-3000}"
export PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
export JAEGER_UI_PORT="${JAEGER_UI_PORT:-16686}"
export LOKI_PORT="${LOKI_PORT:-3100}"
export OBSERVABILITY="${OBSERVABILITY:-1}"

# compose wrapper: always the same project name and compose file.
compose() {
  docker compose -f "$ROOT_DIR/docker-compose.yml" -p "$COMPOSE_PROJECT_NAME" "$@"
}

# Profiles enabled for "up" depending on OBSERVABILITY.
compose_profiles() {
  if [ "$OBSERVABILITY" = "1" ]; then
    echo "--profile observability"
  fi
}
