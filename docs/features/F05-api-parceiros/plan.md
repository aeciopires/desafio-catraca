# F05 — API de parceiros + OpenAPI: plano

<!-- TOC -->

- [F05 — API de parceiros + OpenAPI: plano](#f05--api-de-parceiros--openapi-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: plugin `partner.ts` com o hook de autenticação.
2. `GET /events`, `POST /purchases` (validação manual na ordem do contrato, mapeamento dos erros da F03), `GET /tickets/{id}`.
3. Tratador de erros do escopo (JSON inválido → 422).
4. `registerDocs`: swagger + swagger-ui, esquemas e exemplos.
5. Testes de integração `tests/integration/partner-api.test.ts` (contrato, 401 nas 3 rotas, ordem dos erros, ingresso de outro canal) e `tests/integration/concurrency.test.ts` (rajada de 30 × lotação 5 em 2+ eventos novos via HTTP, repetida).
6. `scripts/evaluator-flow.sh` com os passos de `curl` da API.
7. `make gates` verde; estado `in_review`.
