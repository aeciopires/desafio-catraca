#!/usr/bin/env bash
# Stops everything `up` started (all profiles), then verifies no port answers and no container remains.
#   --volumes : also removes the database volume (fresh start)
set -uo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR" || exit 1

extra=()
[ "${1:-}" = "--volumes" ] && extra+=(--volumes)

info "Derrubando o projeto $COMPOSE_PROJECT_NAME..."
if ! compose --profile '*' down --remove-orphans --timeout 10 ${extra[@]+"${extra[@]}"}; then
  die "DOWN-001" "Falha ao derrubar os serviços" "Docker daemon indisponível ou contêiner travado." \
    "Rode: docker ps --filter label=com.docker.compose.project=$COMPOSE_PROJECT_NAME e remova manualmente com docker rm -f"
fi

left="$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME")"
if [ -n "$left" ]; then
  die "DOWN-002" "Ainda há contêineres do projeto rodando" "Contêiner iniciado fora do compose com o mesmo rótulo." \
    "docker rm -f $left" "docker ps --filter label=com.docker.compose.project=$COMPOSE_PROJECT_NAME"
fi

for port in "$APP_PORT" "$GRAFANA_PORT" "$PROMETHEUS_PORT" "$JAEGER_UI_PORT" "$LOKI_PORT"; do
  if curl -s -m 2 -o /dev/null "http://localhost:$port/" 2>/dev/null; then
    warn "A porta $port ainda responde (provavelmente outro processo fora do projeto)."
  fi
done
ok "Tudo derrubado: nenhum contêiner do projeto em execução"
