# Requisitos

<!-- TOC -->

- [Requisitos](#requisitos)
  - [Qual é o seu sistema?](#qual-é-o-seu-sistema)
  - [Resumo](#resumo)

<!-- TOC -->

## Qual é o seu sistema?

Descubra automaticamente:

```bash
make check-os            # ou: bash scripts/check-os.sh
```

Depois siga o guia do seu sistema:

| Sistema | Arquiteturas | Guia |
| --- | --- | --- |
| Ubuntu 22.04, 24.04, 26.04 | amd64 | [docs/requirements/ubuntu.md](docs/requirements/ubuntu.md) |
| macOS (Colima, sem Docker Desktop) | amd64 (Intel) e arm64 (Apple Silicon) | [docs/requirements/macos.md](docs/requirements/macos.md) |

Outros sistemas (ex.: outra distro no WSL) não são suportados oficialmente; é possível tentar com `ALLOW_UNSUPPORTED_OS=1`.

## Resumo

- **Para só rodar o produto**: Docker Engine + Docker Compose v2 (e Colima no macOS), `git` e `make`. Tudo o resto roda em contêiner.
- **Para desenvolver**: além do anterior, `make install` instala o [mise](https://mise.jdx.dev) no seu usuário e as ferramentas fixadas em `.mise.toml` (Node.js LTS, jq, shellcheck, hadolint) — nada é instalado globalmente.

```bash
make check-dependencies   # verifica e mostra o link oficial do que faltar
make install              # mise + ferramentas do projeto + dependências npm
```
