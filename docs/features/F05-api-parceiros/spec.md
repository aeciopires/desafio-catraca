# F05 — API de parceiros + OpenAPI: spec

<!-- TOC -->

- [F05 — API de parceiros + OpenAPI: spec](#f05--api-de-parceiros--openapi-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome](#consome)
  - [Decisões técnicas](#decisões-técnicas)
    - [Autenticação](#autenticação)
    - [Rotas](#rotas)
    - [OpenAPI](#openapi)
  - [Desvios registrados na implementação](#desvios-registrados-na-implementação)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Implementar o **contrato fixo** da API de parceiros do brief e documentá-lo com OpenAPI/Swagger.

## Regras cobertas

R02, R05, R06, R07, R08, R09.

## Consome

- F01: tabela `partners` (chave da seed `catraca-partner-key-dev`, guardada como sha256), `toIsoOffset`.
- F02: `listPublishedEvents()`.
- F03: `purchaseTicket({channel:'partner', partnerId, buyerEmail, cardNumber})`, `findTicketById`.

## Decisões técnicas

Arquivos: `src/app/routes/partner.ts` (rotas, prefixo `/api/partner`) e `src/app/routes/docs.ts` (`registerDocs(app)`, chamado pela F01 **antes** das rotas para o `@fastify/swagger` enxergá-las).

### Autenticação

Hook `onRequest` no escopo do plugin (roda antes do parse do corpo): `X-Api-Key` ausente ou cujo sha256 não está em `partners` → `401 {"error":"unauthorized"}`. O `partnerId` fica em `request.partner`.

### Rotas

| Rota | Sucesso | Erros (nesta ordem, depois da chave) |
| --- | --- | --- |
| `GET /api/partner/events` | `200 [{id,name,startsAt,priceCents,availableSeats}]` (só `published`) | — |
| `POST /api/partner/events/{eventId}/purchases` | `202 {ticketId, code, status:"pending"}` | `422 invalid_request` (JSON inválido, corpo não-objeto, `buyerEmail` ausente/mal formado, `cardNumber` ausente/não string/sem 16 dígitos) → `404 event_not_available` → `409 sold_out` |
| `GET /api/partner/tickets/{ticketId}` | `200 {ticketId, code, eventId, status, checkedIn}` | `404 ticket_not_found` |

- `startsAt`: ISO 8601 com offset `-03:00` (`toIsoOffset`).
- E-mail válido: `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
- Erro de parse de JSON / content-type: tratador de erro do escopo devolve `422 invalid_request` (nunca `400`/`415`/`500`).
- A validação de esquema do Fastify fica **desligada** para o corpo (`attachValidation: true`) para garantir a ordem e o formato dos erros; os esquemas servem para a documentação.

### OpenAPI

`@fastify/swagger` (OpenAPI 3.0) + `@fastify/swagger-ui` em `/api/docs`; JSON em `/api/openapi.json`. `securitySchemes.ApiKeyAuth` (`apiKey`, header `X-Api-Key`), exemplos do brief (`evt_8f2k`, `tkt_51xq`, `K7Q2M9XA`) e todas as respostas de erro.

## Desvios registrados na implementação

Decisões tomadas durante a implementação e aceitas na avaliação independente. Nenhuma altera o comportamento exigido pelo contrato.

| Tema | Spec original | Implementado | Motivo |
| --- | --- | --- | --- |
| Validação do Fastify | `attachValidation: true` | `setValidatorCompiler(() => () => true)` e serializador `JSON.stringify`, no escopo do plugin | O validador padrão converte tipos (um `cardNumber` numérico viraria texto e seria aceito); assim a validação é toda manual e os campos da resposta saem exatos |
| Content-Type da compra | — | Só `application/json` (ou `+json`); outros → `422 invalid_request` | O `@fastify/formbody` global transformaria um formulário numa compra válida |
| Teste de concorrência | `concurrency.test.ts` | `concurrency-api.test.ts` | Nome distinto do teste de domínio da F03 |

## Fora do escopo

Webhooks para parceiros, paginação, vínculo da compra com conta de participante.
