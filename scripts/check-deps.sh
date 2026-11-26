#!/usr/bin/env bash
# Checks the software required by the project.
#   --runtime : only what `make up` needs (Docker Engine running + Compose v2)
#   (default) : runtime + developer tools (mise, node, git)
# Never installs Docker: prints the official installation URL instead.
set -uo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

mode="${1:-full}"
failed=0
os="$(uname -s)"

docker_url="https://docs.docker.com/engine/install/ubuntu/"
compose_url="https://docs.docker.com/compose/install/linux/"
if [ "$os" = "Darwin" ]; then
  docker_url="https://github.com/abiosoft/colima#installation (brew install colima docker docker-compose)"
  compose_url="https://github.com/abiosoft/colima#docker (plugin docker-compose via Homebrew)"
fi

if ! command -v docker >/dev/null 2>&1; then
  err "DEP-001" "Docker CLI não encontrado" "Docker não está instalado ou não está no PATH." \
    "Instale pelo guia oficial: $docker_url" "command -v docker"
  failed=1
else
  ok "docker: $(docker --version)"
  if ! docker info >/dev/null 2>&1; then
    if [ "$os" = "Darwin" ]; then
      fix="Inicie o Colima: colima start --cpu 4 --memory 6"
    else
      fix="Inicie o serviço (sudo systemctl start docker) e confira se seu usuário está no grupo docker (https://docs.docker.com/engine/install/linux-postinstall/)."
    fi
    err "DEP-002" "Docker daemon inacessível" "O daemon não está rodando ou falta permissão no socket." "$fix" "docker info"
    failed=1
  else
    ok "docker daemon ativo (server $(docker info --format '{{.ServerVersion}}'))"
  fi
  if ! docker compose version >/dev/null 2>&1; then
    err "DEP-003" "Docker Compose v2 (plugin 'docker compose') não encontrado" \
      "O plugin compose não está instalado." "Instale pelo guia oficial: $compose_url" "docker compose version"
    failed=1
  else
    ok "$(docker compose version)"
  fi
fi

if [ "$os" = "Darwin" ]; then
  if command -v colima >/dev/null 2>&1; then
    ok "colima: $(colima version 2>/dev/null | head -1)"
  else
    warn "Colima não encontrado. No macOS o projeto usa Colima (não Docker Desktop): https://github.com/abiosoft/colima"
  fi
fi

if [ "$mode" != "--runtime" ]; then
  for tool in git make; do
    if command -v "$tool" >/dev/null 2>&1; then ok "$tool: $($tool --version | head -1)"; else
      err "DEP-004" "$tool não encontrado" "Ferramenta básica ausente." "Instale pelo gerenciador do SO (veja REQUIREMENTS.md)."
      failed=1
    fi
  done
  if command -v mise >/dev/null 2>&1 || [ -x "$HOME/.local/bin/mise" ]; then
    ok "mise: $( (command -v mise >/dev/null && mise --version) || "$HOME/.local/bin/mise" --version)"
  else
    warn "mise não encontrado (necessário apenas para desenvolvimento local). Rode: make install"
  fi
fi

if [ "$failed" = "1" ]; then
  exit 1
fi
ok "Dependências verificadas"
