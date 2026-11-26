# F02 — Gestão de eventos: contrato

<!-- TOC -->

- [F02 — Gestão de eventos: contrato](#f02--gestão-de-eventos-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F02-01 — Criar evento nasce rascunho](#c-f02-01--criar-evento-nasce-rascunho)
    - [C-F02-02 — Validações de criação/edição](#c-f02-02--validações-de-criaçãoedição)
    - [C-F02-03 — Lotação vs vagas ocupadas](#c-f02-03--lotação-vs-vagas-ocupadas)
    - [C-F02-04 — Página de gestão com URL própria](#c-f02-04--página-de-gestão-com-url-própria)
    - [C-F02-05 — Isolamento entre organizadores](#c-f02-05--isolamento-entre-organizadores)
    - [C-F02-06 — Publicação e bloqueio de cancelado](#c-f02-06--publicação-e-bloqueio-de-cancelado)
    - [C-F02-07 — Testes automatizados](#c-f02-07--testes-automatizados)
    - [C-F02-08 — Cross-feature com F01](#c-f02-08--cross-feature-com-f01)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`); `WEB=http://localhost:${APP_PORT:-8080}`.
- Contas da seed (organizador A e B). Os testes de integração rodam com `make test-integration`.

## Itens verificáveis

### C-F02-01 — Criar evento nasce rascunho

Como organizador A, `POST /organizer/events` com dados válidos → `303` para `/organizer/events/{id}`; a página mostra `data-testid="event-status"` = `Rascunho`.

### C-F02-02 — Validações de criação/edição

Data de ontem → `422` e `form-error` contém `A data de início precisa estar no futuro`; lotação `0` → `A lotação deve ser um número inteiro maior ou igual a 1`; preço `0` → `O preço deve ser maior que zero`. Na edição, data passada também é rejeitada.

### C-F02-03 — Lotação vs vagas ocupadas

Com 2 ingressos `pending`/`confirmed` no evento (inseridos via compra ou SQL), editar lotação para 1 → `422` com `A lotação não pode ser menor que as vagas ocupadas (2)`; editar para 3 → `303` e a página mostra lotação 3.

### C-F02-04 — Página de gestão com URL própria

`GET /organizer/events/{id}` como dono → `200` com `event-name`, `edit-form` e botão de publicar (rascunho).

### C-F02-05 — Isolamento entre organizadores

Como organizador B: `GET /organizer/events` não contém o nome do evento de A; `GET /organizer/events/{idDeA}` → `404` e o HTML não contém o nome do evento; `POST /organizer/events/{idDeA}` e `/publish` → `404` sem efeito.

### C-F02-06 — Publicação e bloqueio de cancelado

`POST /organizer/events/{id}/publish` → status `Publicado`. Com o evento `cancelled`, a página não mostra `edit-form` nem botão de publicar; `POST` de edição → `422` com `Evento cancelado não pode ser editado`; `POST /publish` não muda o status.

### C-F02-07 — Testes automatizados

`tests/unit/events-validation.test.ts` e `tests/integration/events.test.ts` passam em `make gates`.

### C-F02-08 — Cross-feature com F01

Organizador da seed (F01) acessa a lista (`200`); participante da seed recebe `403` em `/organizer/events/new`.

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F02-AC01 | C-F02-01, C-F02-07 |
| F02-AC02 | C-F02-02, C-F02-07 |
| F02-AC03 | C-F02-03 |
| F02-AC04 | C-F02-04 |
| F02-AC05 | C-F02-05 |
| F02-AC06 | C-F02-06 |
| XF-F01-F02-01 | C-F02-08 |
