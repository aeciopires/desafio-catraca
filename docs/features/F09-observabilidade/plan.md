# F09 — Observabilidade: plano

<!-- TOC -->

- [F09 — Observabilidade: plano](#f09--observabilidade-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: serviços no `docker-compose.yml` (perfil `observability`) e arquivos de configuração vazios.
2. `src/observability/otel.ts` (SDK, exporters OTLP, desligável) e `metrics.ts` (registro prom-client, contadores, gauges com coleta no banco); `/metrics` no app e no worker.
3. Instrumentar compra, gateway/worker, check-in e cancelamento com os contadores (mudanças pequenas e localizadas).
4. Configurar Collector, Prometheus, Loki, Jaeger e provisionamento do Grafana (datasources com correlação + 2 dashboards).
5. Teste de integração `tests/integration/metrics.test.ts` (`/metrics` expõe as métricas e os contadores sobem após compras/esgotado).
6. Documentar em `docs/operations/observabilidade.md` com diagrama e analogia.
7. `make gates` verde; `make down` derruba tudo; estado `in_review`.
