# Imagens Docker e compatibilidade

<!-- TOC -->

- [Imagens Docker e compatibilidade](#imagens-docker-e-compatibilidade)
  - [Matriz suportada](#matriz-suportada)
  - [Versões fixadas (verificadas em 2026-11-25)](#versões-fixadas-verificadas-em-2026-11-25)

<!-- TOC -->

## Matriz suportada

| Host | Arquitetura | Runtime | Plataforma das imagens |
| --- | --- | --- | --- |
| Ubuntu 22.04 / 24.04 / 26.04 | amd64 | Docker Engine + Compose v2 | `linux/amd64` |
| macOS Intel | amd64 | Colima | `linux/amd64` |
| macOS Apple Silicon | arm64 | Colima | `linux/arm64` |

A imagem do projeto (`docker/app.Dockerfile`) parte de `node:26.13.1-trixie-slim` (multi-arch) e não compila nada nativo (TypeScript roda direto no Node; `bcryptjs` é JS puro), então constrói igual nas duas arquiteturas. `make build-multiarch` gera `linux/amd64` e `linux/arm64` com `docker buildx`.

## Versões fixadas (verificadas em 2026-11-25)

Todas conferidas com `docker buildx imagetools inspect <imagem>` listando `linux/amd64` e `linux/arm64`.

| Imagem | Uso |
| --- | --- |
| `node:26.13.1-trixie-slim` | Base do app, worker, migrate e tools (Node.js 26 LTS) |
| `postgres:18.7-alpine` | Banco |
| `otel/opentelemetry-collector-contrib:0.166.0` | Coletor OTLP (F09) |
| `prom/prometheus:v3.16.0` | Métricas (F09) |
| `grafana/grafana:13.3.2` | Dashboards (F09) |
| `jaegertracing/jaeger:2.23.0` | Traces (F09) |
| `grafana/loki:3.7.10` | Logs (F09) |

Atualizações seguem o procedimento do [CLAUDE.md](../../CLAUDE.md) (somente quando solicitado explicitamente).
