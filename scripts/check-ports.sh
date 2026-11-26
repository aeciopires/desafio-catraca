#!/usr/bin/env bash
# Verifies that every host port the stack will publish is free.
# A port already used by this project's own containers is accepted (idempotent `make up`).
set -uo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

ports=("APP_PORT:$APP_PORT")
if [ "$OBSERVABILITY" = "1" ]; then
  ports+=("GRAFANA_PORT:$GRAFANA_PORT" "PROMETHEUS_PORT:$PROMETHEUS_PORT" "JAEGER_UI_PORT:$JAEGER_UI_PORT" "LOKI_PORT:$LOKI_PORT")
fi

# Ports already published by this compose project (re-running `make up` is fine).
own_ports="$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --format '{{.Ports}}' 2>/dev/null || true)"

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "sport = :$port" 2>/dev/null | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null
  fi
}

who_uses() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1" (pid "$2")"}'
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'users:(([^)]*' | head -1 | sed 's/users:((//'
  fi
}

failed=0
seen=" " # bash 3.2 (macOS) has no associative arrays: "port=VAR" pairs separated by spaces
for entry in "${ports[@]}"; do
  var="${entry%%:*}"
  port="${entry##*:}"
  prev="$(echo "$seen" | tr ' ' '\n' | grep "^$port=" | cut -d= -f2 || true)"
  if [ -n "$prev" ]; then
    err "PORT-002" "A porta $port foi atribuída a $var e a $prev" \
      "Duas variáveis apontam para a mesma porta." "Defina valores diferentes, ex.: export $var=$((port + 1))"
    failed=1
    continue
  fi
  seen="$seen$port=$var "
  if echo "$own_ports" | grep -qE "(0\.0\.0\.0|\[::\]|127\.0\.0\.1):$port->"; then
    continue
  fi
  if port_in_use "$port"; then
    proc="$(who_uses "$port")"
    err "PORT-001" "Porta $port ($var) já está em uso${proc:+ por $proc}" \
      "Outro processo ou container está escutando nessa porta." \
      "Libere a porta ou escolha outra: export $var=<porta livre> && make up" \
      "ss -ltnp 'sport = :$port'  (ou: lsof -nP -iTCP:$port -sTCP:LISTEN)"
    failed=1
  fi
done

[ "$failed" = "1" ] && exit 1
ok "Portas livres: ${ports[*]}"
