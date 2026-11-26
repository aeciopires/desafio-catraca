#!/usr/bin/env bash
# Brings the whole stack up from a clean clone: checks, build, migrations + seed, healthchecks.
# Equivalent to `make up` for machines without make.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

bash scripts/check-os.sh
bash scripts/check-deps.sh --runtime
bash scripts/check-ports.sh

if [ "$OBSERVABILITY" = "1" ]; then
  export OTEL_SDK_DISABLED="${OTEL_SDK_DISABLED:-false}"
else
  export OTEL_SDK_DISABLED=true
fi

# shellcheck disable=SC2046
profiles=$(compose_profiles)

info "Construindo imagens (projeto: $COMPOSE_PROJECT_NAME)..."
# shellcheck disable=SC2086
if ! compose $profiles build; then
  die "UP-001" "Falha no build das imagens" "Erro no Dockerfile, rede sem acesso ao registry ou dependência npm indisponível." \
    "Veja a saída acima; tente novamente com: docker compose build --no-cache" "docker compose -p $COMPOSE_PROJECT_NAME build"
fi

info "Subindo serviços..."
# shellcheck disable=SC2086
if ! compose $profiles up -d --remove-orphans --wait --wait-timeout "${UP_TIMEOUT:-180}"; then
  err "UP-002" "Serviços não ficaram saudáveis a tempo" \
    "Algum contêiner falhou ao iniciar (migração, banco, porta ou configuração)." \
    "Veja os logs abaixo e rode: make logs SERVICE=<serviço>" "docker compose -p $COMPOSE_PROJECT_NAME ps -a"
  compose ps -a >&2 || true
  for svc in migrate app worker postgres; do
    echo "----- últimas linhas de $svc -----" >&2
    compose logs --no-color --tail 30 "$svc" >&2 || true
  done
  exit 1
fi

WEB="http://localhost:$APP_PORT"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "$WEB/healthz" 2>/dev/null; then break; fi
  sleep 1
done
if ! curl -fsS -o /dev/null "$WEB/healthz"; then
  die "UP-003" "O app não respondeu em $WEB/healthz" "Contêiner saudável, mas a porta publicada não está acessível do host." \
    "Confira APP_PORT e firewall; logs: make logs SERVICE=app"
fi

ok "Catraca no ar"
cat <<EOF

  Produto (\$WEB) e API (\$API): $WEB
  Swagger:                       $WEB/api/docs
  Organizador A:  organizador.a@catraca.local / catraca123
  Organizador B:  organizador.b@catraca.local / catraca123
  Participante:   participante@catraca.local / catraca123
  Chave parceiro: ${PARTNER_API_KEY:-catraca-partner-key-dev}   (header X-Api-Key)
EOF
if [ "$OBSERVABILITY" = "1" ] && compose --profile observability config --services 2>/dev/null | grep -q grafana; then
  cat <<EOF
  Grafana:        http://localhost:$GRAFANA_PORT   (admin / admin)
  Prometheus:     http://localhost:$PROMETHEUS_PORT
  Jaeger:         http://localhost:$JAEGER_UI_PORT
  Loki:           http://localhost:$LOKI_PORT
EOF
fi
echo
