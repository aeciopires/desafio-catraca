#!/usr/bin/env bash
# Runs a test suite inside the "tools" container: `up` before, `down` after (always), then prints
# a summary and returns the suite's exit code.
#   usage: scripts/run-tests.sh unit|integration|all|static
#   KEEP_UP=1 keeps the stack running afterwards (used by gates to run several suites in one up).
set -uo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR" || exit 1

suite="${1:-all}"
# Integration tests use a faster gateway unless told otherwise (default product mode stays 1).
export GATEWAY_DELAY_SCALE="${TEST_GATEWAY_DELAY_SCALE:-0.1}"
export OBSERVABILITY="${OBSERVABILITY:-0}"

# shellcheck disable=SC2329 # invoked by the EXIT trap
cleanup() {
  if [ "${KEEP_UP:-0}" != "1" ]; then
    if bash scripts/down.sh >/dev/null 2>&1; then ok "Ambiente derrubado (make down)"; else warn "make down falhou; rode manualmente"; fi
  fi
}
trap cleanup EXIT

if [ "${SKIP_UP:-0}" != "1" ]; then
  bash scripts/up.sh || die "TEST-001" "Não foi possível subir o ambiente para os testes" \
    "Veja o erro de subida acima." "Corrija e rode novamente: make test-$suite"
fi
compose --profile tools build tools >/dev/null || die "TEST-002" "Falha no build da imagem de testes" \
  "Dependências de desenvolvimento indisponíveis." "docker compose --profile tools build tools"

run() {
  local name="$1"
  shift
  info "Executando: $name"
  local start=$SECONDS
  compose --profile tools run --rm -T tools "$@"
  local code=$?
  results+=("$name: $([ $code -eq 0 ] && echo OK || echo FALHOU) ($((SECONDS - start))s)")
  [ $code -ne 0 ] && overall=1
  return 0
}

results=()
overall=0
case "$suite" in
  unit) run "testes unitários" npm run test:unit ;;
  integration) run "testes de integração" npm run test:integration ;;
  static)
    run "lint" npm run lint
    run "typecheck" npm run typecheck
    ;;
  all)
    run "lint" npm run lint
    run "typecheck" npm run typecheck
    run "testes unitários" npm run test:unit
    run "testes de integração" npm run test:integration
    ;;
  *) die "TEST-003" "Suíte desconhecida: $suite" "Argumento inválido." "Use unit, integration, static ou all." ;;
esac

echo
echo "================ Resumo ($suite) ================"
for r in "${results[@]}"; do echo "  $r"; done
echo "================================================="
if [ "$overall" -ne 0 ]; then
  err "TEST-004" "Há suítes com falha" "Veja a saída do Vitest acima (arquivo e asserção)." \
    "Corrija e rode de novo; para depurar com o ambiente no ar: KEEP_UP=1 make test-$suite"
fi
exit "$overall"
