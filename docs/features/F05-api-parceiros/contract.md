# F05 — API de parceiros + OpenAPI: contrato

<!-- TOC -->

- [F05 — API de parceiros + OpenAPI: contrato](#f05--api-de-parceiros--openapi-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F05-01 — Listagem](#c-f05-01--listagem)
    - [C-F05-02 — Compra](#c-f05-02--compra)
    - [C-F05-03 — Ordem dos erros da compra](#c-f05-03--ordem-dos-erros-da-compra)
    - [C-F05-04 — Autenticação](#c-f05-04--autenticação)
    - [C-F05-05 — Consulta de ingresso](#c-f05-05--consulta-de-ingresso)
    - [C-F05-06 — Swagger](#c-f05-06--swagger)
    - [C-F05-07 — Concorrência pela API (passo 15 do fluxo)](#c-f05-07--concorrência-pela-api-passo-15-do-fluxo)
    - [C-F05-08 — Cross-feature F01/F02 → F05](#c-f05-08--cross-feature-f01f02--f05)
    - [C-F05-09 — Cross-feature F03 → F04 via API](#c-f05-09--cross-feature-f03--f04-via-api)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`); `API=http://localhost:${APP_PORT:-8080}`; `KEY=catraca-partner-key-dev`.

## Itens verificáveis

### C-F05-01 — Listagem

`curl -s -H "X-Api-Key: $KEY" $API/api/partner/events` → `200`, array; evento publicado de lotação 2 e R$ 100,00 aparece com `availableSeats: 2`, `priceCents: 10000`, `startsAt` com offset; rascunho e cancelado não aparecem.

### C-F05-02 — Compra

`POST $API/api/partner/events/$E/purchases` com `{"buyerEmail":"t@example.com","cardNumber":"4000000000000001"}` → `202` e corpo com exatamente `ticketId`, `code`, `status:"pending"`.

### C-F05-03 — Ordem dos erros da compra

Corpo `{"cardNumber":"123"}` em evento inexistente → `422 {"error":"invalid_request"}` (corpo é verificado antes do evento); JSON quebrado → `422`; e-mail `x@` → `422`; corpo válido em evento inexistente/rascunho → `404 {"error":"event_not_available"}`; evento sem vaga → `409 {"error":"sold_out"}`.

### C-F05-04 — Autenticação

As três rotas sem cabeçalho e com chave errada → `401 {"error":"unauthorized"}` (6 chamadas), inclusive com corpo inválido.

### C-F05-05 — Consulta de ingresso

`GET /api/partner/tickets/$T` → `200` com `ticketId`, `code`, `eventId`, `status`, `checkedIn`; ingresso comprado na vitrine também é consultável; `tkt_inexistente` → `404 {"error":"ticket_not_found"}`.

### C-F05-06 — Swagger

`GET /api/docs` → `200` (HTML do Swagger UI); `GET /api/openapi.json` contém os 3 caminhos, `securitySchemes` com `X-Api-Key` e as respostas 401/404/409/422.

### C-F05-07 — Concorrência pela API (passo 15 do fluxo)

Em 2 eventos novos de lotação 5 (e em ≥ 5 repetições no teste automatizado), `seq 30 | xargs -P 30 ... curl ... -w "%{http_code}"` → exatamente `5 202` e `25 409`.

### C-F05-08 — Cross-feature F01/F02 → F05

A chave da seed (F01) funciona e outra não (C-F05-04); rascunho criado pela F02 não aparece e, publicado, aparece com `availableSeats` = lotação (C-F05-01).

### C-F05-09 — Cross-feature F03 → F04 via API

Compra pela API (`…0004`) ocupa a última vaga: a listagem mostra `availableSeats: 0` e a vitrine `Ingressos esgotados`.

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F05-AC01 | C-F05-01 |
| F05-AC02 | C-F05-02 |
| F05-AC03 | C-F05-03 |
| F05-AC04 | C-F05-04 |
| F05-AC05 | C-F05-05 |
| F05-AC06 | C-F05-06 |
| XF-F01-F05-01 | C-F05-08, C-F05-04 |
| XF-F02-F05-01 | C-F05-08, C-F05-01 |
| XF-F03-F05-01 | C-F05-07 |
| XF-F03-F04-02 | C-F05-09 |
