#!/usr/bin/env bash
# Validates the operating system and CPU architecture against the supported matrix:
#   - Ubuntu 22.04, 24.04, 26.04 on amd64 (x86_64)
#   - macOS on amd64 (x86_64) and arm64 (Apple Silicon), using Colima
# Set ALLOW_UNSUPPORTED_OS=1 to continue on other systems (e.g. WSL with another distro).
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

SUPPORTED_UBUNTU="22.04 24.04 26.04"
os="$(uname -s)"
arch="$(uname -m)"
detected=""
supported=0
family=""

case "$os" in
  Linux)
    if [ -r /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      detected="${NAME:-Linux} ${VERSION_ID:-?} ($arch)"
      if [ "${ID:-}" = "ubuntu" ] && [ "$arch" = "x86_64" ]; then
        for v in $SUPPORTED_UBUNTU; do
          [ "${VERSION_ID:-}" = "$v" ] && supported=1 && family="ubuntu"
        done
      fi
    else
      detected="Linux desconhecido ($arch)"
    fi
    ;;
  Darwin)
    detected="macOS $(sw_vers -productVersion 2>/dev/null || echo '?') ($arch)"
    if [ "$arch" = "x86_64" ] || [ "$arch" = "arm64" ]; then
      supported=1
      family="macos"
    fi
    ;;
  *)
    detected="$os ($arch)"
    ;;
esac

if [ "$supported" = "1" ]; then
  ok "Sistema operacional suportado: $detected"
  if [ "${1:-}" = "--print-family" ]; then echo "$family"; fi
  exit 0
fi

if [ "${ALLOW_UNSUPPORTED_OS:-0}" = "1" ]; then
  warn "Sistema operacional não suportado oficialmente: $detected. Continuando porque ALLOW_UNSUPPORTED_OS=1."
  exit 0
fi

die "OS-001" "Sistema operacional não suportado: $detected" \
  "A matriz suportada é Ubuntu 22.04/24.04/26.04 (amd64) e macOS (amd64/arm64)." \
  "Use um SO suportado ou rode com ALLOW_UNSUPPORTED_OS=1 (por sua conta e risco)." \
  "Veja REQUIREMENTS.md"
