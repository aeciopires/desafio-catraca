#!/usr/bin/env bash
# Installs ONLY mise (into ~/.local/bin, user scope) and the project tools/dependencies.
# Never installs Docker or anything system-wide (no sudo).
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

bash scripts/check-os.sh

MISE_BIN="$(command -v mise || true)"
if [ -z "$MISE_BIN" ] && [ -x "$HOME/.local/bin/mise" ]; then MISE_BIN="$HOME/.local/bin/mise"; fi

if [ -z "$MISE_BIN" ]; then
  info "Instalando mise em ~/.local/bin (instalador oficial https://mise.run)..."
  if ! curl -fsSL https://mise.run | sh; then
    die "INSTALL-001" "Falha ao instalar o mise" "Sem acesso à internet ou bloqueio de proxy." \
      "Instale manualmente: https://mise.jdx.dev/getting-started.html"
  fi
  MISE_BIN="$HOME/.local/bin/mise"
fi
ok "mise: $("$MISE_BIN" --version)"

"$MISE_BIN" trust --yes "$ROOT_DIR/.mise.toml" >/dev/null 2>&1 || true
info "Instalando ferramentas do .mise.toml (node, jq, shellcheck, hadolint)..."
"$MISE_BIN" install || die "INSTALL-002" "mise install falhou" "Versão indisponível ou sem rede." \
  "Rode: $MISE_BIN install --verbose"

info "Instalando dependências npm do projeto (node_modules local)..."
"$MISE_BIN" exec -- npm ci || die "INSTALL-003" "npm ci falhou" "package-lock.json inconsistente ou sem rede." \
  "Rode: mise exec -- npm ci --verbose"

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker não encontrado. Ele NÃO é instalado por este comando; veja REQUIREMENTS.md."
fi
ok "Instalação concluída. Ative o mise no shell: eval \"\$($MISE_BIN activate bash)\" (ou zsh)"
