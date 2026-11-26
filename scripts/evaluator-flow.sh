#!/usr/bin/env bash
# Evaluator flow (TASK.md) driven by curl against the running stack. Implemented by F05.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
die "FLOW-000" "Fluxo do avaliador ainda não implementado" "A F05 (API de parceiros) ainda não foi entregue." \
  "Aguarde a W3 ou rode os testes de integração: make test-integration"
