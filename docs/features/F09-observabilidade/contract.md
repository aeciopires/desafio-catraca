# F09 — Observabilidade: contrato

<!-- TOC -->

- [F09 — Observabilidade: contrato](#f09--observabilidade-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F09-01 — Serviços sobem e caem](#c-f09-01--serviços-sobem-e-caem)
    - [C-F09-02 — Métricas de negócio](#c-f09-02--métricas-de-negócio)
    - [C-F09-03 — Contadores refletem o uso](#c-f09-03--contadores-refletem-o-uso)
    - [C-F09-04 — Grafana correlacionado](#c-f09-04--grafana-correlacionado)
    - [C-F09-05 — Produto sem observabilidade](#c-f09-05--produto-sem-observabilidade)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- `make up` com `OBSERVABILITY=1` (padrão); portas 3000, 9090, 16686, 3100 livres (ou variáveis ajustadas).

## Itens verificáveis

### C-F09-01 — Serviços sobem e caem

Após `make up`, `docker compose -p catraca ps` mostra `otel-collector`, `prometheus`, `grafana`, `jaeger`, `loki` em execução; `curl -s localhost:9090/-/ready`, `localhost:3000/api/health`, `localhost:16686/`, `localhost:3100/ready` respondem. Após `make down`, nenhum responde e `docker ps` não lista containers do projeto.

### C-F09-02 — Métricas de negócio

`curl -s $WEB/metrics` contém `catraca_tickets_created_total`, `catraca_purchases_rejected_total`, `catraca_gateway_calls_total`, `catraca_pending_confirmations`, `catraca_tickets_by_status`, `catraca_revenue_cents`, `catraca_checkins_total`.

### C-F09-03 — Contadores refletem o uso

Após uma compra aprovada, uma recusada e uma `sold_out`, `catraca_purchases_rejected_total{reason="sold_out"}` aumenta e `catraca_gateway_calls_total` soma ≥ 2 (consulta no Prometheus `http://localhost:9090/api/v1/query?query=catraca_gateway_calls_total`, após o próximo *scrape*).

### C-F09-04 — Grafana correlacionado

`GET localhost:3000/api/datasources` lista Prometheus, Loki e Jaeger; `GET /api/search?query=Catraca` lista os 2 dashboards; um log de requisição no Loki (`{service_name="catraca-app"}`) tem `trace_id` e o trace correspondente existe no Jaeger (`/api/traces/<trace_id>`).

### C-F09-05 — Produto sem observabilidade

`make down && OBSERVABILITY=0 make up` sobe só `postgres`, `app`, `worker` (e `migrate` concluído) e o fluxo de compra funciona.

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F09-AC01 | C-F09-01 |
| F09-AC02 | C-F09-02 |
| F09-AC03 | C-F09-04 |
| F09-AC04 | C-F09-05 |
| XF-F01-F09-01 | C-F09-01 |
| XF-F03-F09-01 | C-F09-03 |
