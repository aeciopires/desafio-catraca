#!/usr/bin/env bash
# Project gates: spec/report/TOC checks (host, need git + node) and lint, typecheck, unit and
# integration tests (inside containers). Equivalent to `make gates`.
set -uo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR" || exit 1

failed=0
step() {
  local name="$1"
  shift
  info "Gate: $name"
  if "$@"; then ok "$name"; else
    err "GATE-001" "Gate '$name' falhou" "Veja a saída acima." "Corrija e rode make gates novamente."
    failed=1
  fi
}

if ! command -v node >/dev/null 2>&1; then
  die "GATE-002" "Node.js não encontrado no host" "Os checadores de spec/TOC usam Node.js (LTS)." \
    "Instale o Node.js LTS (https://nodejs.org) ou rode make install (mise)."
fi

step "check-spec" node scripts/check-spec.mjs
step "check-reports" bash scripts/check-reports.sh
step "toc-check" node scripts/gen-toc.mjs --check
step "lint + typecheck + unit + integration" bash scripts/run-tests.sh all

if [ "$failed" -ne 0 ]; then
  err "GATE-003" "Gates reprovados" "Pelo menos um gate falhou." "Veja os erros acima."
  exit 1
fi
ok "Todos os gates passaram"
