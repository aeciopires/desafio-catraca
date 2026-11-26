# Requisitos — macOS (Intel amd64 e Apple Silicon arm64)

<!-- TOC -->

- [Requisitos — macOS (Intel amd64 e Apple Silicon arm64)](#requisitos--macos-intel-amd64-e-apple-silicon-arm64)
  - [Caminho automático (recomendado)](#caminho-automático-recomendado)
  - [Instalação manual (fontes oficiais)](#instalação-manual-fontes-oficiais)
    - [Ferramentas de linha de comando (git, make)](#ferramentas-de-linha-de-comando-git-make)
    - [Homebrew](#homebrew)
    - [Colima + Docker CLI + Compose](#colima--docker-cli--compose)
    - [mise (ferramentas de desenvolvimento)](#mise-ferramentas-de-desenvolvimento)
  - [Problemas comuns](#problemas-comuns)

<!-- TOC -->

No macOS o projeto usa **Colima** como runtime de contêineres (não usa Docker Desktop). As imagens do projeto têm variantes `linux/amd64` e `linux/arm64`, então rodam nativamente nos dois tipos de Mac.

## Caminho automático (recomendado)

```bash
make check-os             # confirma macOS em x86_64 ou arm64
make check-dependencies   # Docker CLI, Compose, Colima, daemon, git, make, mise
make install              # instala mise em ~/.local/bin + ferramentas do .mise.toml + npm ci
```

`make install` **não** instala Colima/Docker; se faltar, `make check-dependencies` mostra o link oficial.

## Instalação manual (fontes oficiais)

### Ferramentas de linha de comando (git, make)

```bash
xcode-select --install
```

### Homebrew

Guia oficial: <https://brew.sh>

### Colima + Docker CLI + Compose

Guia oficial do Colima: <https://github.com/abiosoft/colima#installation>

```bash
brew install colima docker docker-compose docker-buildx
```

Habilite o plugin do Compose/Buildx no Docker CLI (instrução exibida pelo Homebrew): adicione em `~/.docker/config.json`:

```json
{ "cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"] }
```

(em Macs Intel o caminho é `/usr/local/lib/docker/cli-plugins`).

Inicie a VM do Colima (recomendado ≥ 4 CPUs e 6 GB por causa do stack de observabilidade):

```bash
colima start --cpu 4 --memory 6
docker context use colima
docker run --rm hello-world
docker compose version
```

Em Apple Silicon a VM roda `arm64` nativo; para testar a imagem `amd64` use `make build-multiarch`.

### mise (ferramentas de desenvolvimento)

Guia oficial: <https://mise.jdx.dev/getting-started.html>

```bash
curl https://mise.run | sh                         # ~/.local/bin/mise
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
cd desafio-catraca && mise trust && mise install
npm ci
```

## Problemas comuns

- `Cannot connect to the Docker daemon`: rode `colima start` e `docker context use colima`.
- Porta ocupada: veja [docs/operations/configuracao.md](../operations/configuracao.md) (`APP_PORT`, `GRAFANA_PORT`…).
- O `bash` do macOS é 3.2: os scripts do projeto são compatíveis com ele.
