# F09 — Observabilidade: spec

<!-- TOC -->

- [F09 — Observabilidade: spec](#f09--observabilidade-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome](#consome)
  - [Decisões técnicas](#decisões-técnicas)
    - [Serviços (perfil `observability` do Compose, ligado por padrão via `OBSERVABILITY=1`)](#serviços-perfil-observability-do-compose-ligado-por-padrão-via-observability1)
    - [Fluxo](#fluxo)
    - [Métricas](#métricas)
    - [Grafana](#grafana)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Dar visibilidade de negócio e técnica ao produto (e à execução dos agentes/avaliador) correlacionando métricas, traces e logs no Grafana. O avaliador não confere dashboards; eles ajudam a diagnosticar.

## Regras cobertas

Suporte a R07, R08, R11 e R12 (métricas); nenhuma regra de produto depende desta feature.

## Consome

- F01: Compose, `app`, `worker`, logger pino.
- F03: pontos de compra/gateway/worker a instrumentar.

## Decisões técnicas

### Serviços (perfil `observability` do Compose, ligado por padrão via `OBSERVABILITY=1`)

| Serviço | Imagem | Porta host |
| --- | --- | --- |
| `otel-collector` | `otel/opentelemetry-collector-contrib:0.166.0` | interna (4318) |
| `prometheus` | `prom/prometheus:v3.16.0` | `PROMETHEUS_PORT` (9090) |
| `jaeger` | `jaegertracing/jaeger:2.23.0` | `JAEGER_UI_PORT` (16686) |
| `loki` | `grafana/loki:3.7.10` | `LOKI_PORT` (3100) |
| `grafana` | `grafana/grafana:13.3.2` | `GRAFANA_PORT` (3000), login anônimo de leitura + `admin/admin` |

Todas com manifest `linux/amd64` + `linux/arm64`.

### Fluxo

- **Traces**: `@opentelemetry/sdk-node` + `auto-instrumentations-node` (http, fastify, pg, pino) carregado com `node --import ./src/observability/otel.ts`; OTLP HTTP → Collector → Jaeger (OTLP).
- **Logs**: pino com `trace_id`/`span_id` (instrumentação pino) → OTLP logs → Collector → Loki (endpoint OTLP nativo `/otlp`).
- **Métricas**: `prom-client` em `/metrics` no `app` (porta do app) e no `worker` (porta interna 9464); Prometheus faz *scrape* direto. Métricas de estado (ingressos por status, pendentes, receita) são *gauges* calculados no *scrape* a partir do banco — refletem a verdade mesmo com vários processos.
- Com `OBSERVABILITY=0`, `OTEL_SDK_DISABLED=true`: o produto não depende de nenhum serviço de observabilidade.

### Métricas

| Métrica | Tipo | Labels |
| --- | --- | --- |
| `catraca_tickets_created_total` | counter | `channel` |
| `catraca_purchases_rejected_total` | counter | `reason` (`sold_out`, `event_not_available`, `invalid_request`/`invalid_card`) |
| `catraca_gateway_calls_total` | counter | `outcome` (`approved`, `declined`), `applied` (`true`/`false` — resposta tardia ignorada) |
| `catraca_gateway_latency_seconds` | histogram | `outcome` |
| `catraca_checkins_total` | counter | `result` |
| `catraca_events_cancelled_total` | counter | — |
| `catraca_tickets_by_status` | gauge | `status` |
| `catraca_pending_confirmations` | gauge | — |
| `catraca_revenue_cents` | gauge | — (soma dos confirmados) |
| `catraca_payment_jobs_due` | gauge | — (fila do worker) |
| `http_request_duration_seconds` | histogram | `method`, `route`, `status_code` |

"Chamadas ao modelo" do pedido foi interpretado como chamadas ao provedor externo do domínio (gateway de pagamento), já que o produto não chama modelo de IA.

### Grafana

Provisionamento em `docker/grafana/provisioning/`: datasources Prometheus (padrão), Loki (`derivedFields` `trace_id` → Jaeger) e Jaeger (`tracesToLogsV2` → Loki por `trace_id`). Dashboards em `docker/grafana/dashboards/`: **Catraca — Negócio** (vendas por canal, esgotados, pendentes, receita, check-ins, estornos, latência do gateway) e **Catraca — Técnico** (RPS, p50/p95 por rota, erros 5xx, fila do worker, logs recentes).

## Fora do escopo

Alertas, retenção longa, autenticação do Grafana além do padrão local.
