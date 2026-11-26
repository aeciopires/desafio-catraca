# F06 — Check-in: contrato

<!-- TOC -->

- [F06 — Check-in: contrato](#f06--check-in-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F06-01 — Código inválido](#c-f06-01--código-inválido)
    - [C-F06-02 — Evento cancelado](#c-f06-02--evento-cancelado)
    - [C-F06-03 — Não confirmado](#c-f06-03--não-confirmado)
    - [C-F06-04 — Já utilizado](#c-f06-04--já-utilizado)
    - [C-F06-05 — Entrada liberada](#c-f06-05--entrada-liberada)
    - [C-F06-06 — Dono](#c-f06-06--dono)
    - [C-F06-07 — Ordem de R10 (unitário)](#c-f06-07--ordem-de-r10-unitário)
    - [C-F06-08 — Cross-feature com F02/F03](#c-f06-08--cross-feature-com-f02f03)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`); organizador A e B da seed; `API`/`KEY` para criar ingressos pela API.

## Itens verificáveis

### C-F06-01 — Código inválido

Na página de gestão de E1, código `ZZZZZZZZ` → `checkin-result` = `Ingresso inválido para este evento`; código de ingresso **confirmado** de outro evento (E2) → a mesma mensagem.

### C-F06-02 — Evento cancelado

Ingresso confirmado de um evento cancelado → `Evento cancelado` (mesmo estando confirmado e sem check-in).

### C-F06-03 — Não confirmado

Ingresso `pending` (cartão `…0003`/`…0004`) ou `declined` → `Ingresso não confirmado`.

### C-F06-04 — Já utilizado

Segundo check-in do mesmo código → `Ingresso já utilizado`.

### C-F06-05 — Entrada liberada

Primeiro check-in de ingresso confirmado → `Entrada liberada`; `GET /api/partner/tickets/{id}` passa a mostrar `checkedIn: true`. Dez requisições simultâneas do mesmo código → exatamente uma `Entrada liberada`.

### C-F06-06 — Dono

Organizador B → `POST /organizer/events/{idDeA}/checkin` → `404` e o ingresso continua `checkedIn: false`.

### C-F06-07 — Ordem de R10 (unitário)

`tests/unit/checkin.test.ts` cobre a precedência: inexistente > cancelado > não confirmado > já utilizado > liberada.

### C-F06-08 — Cross-feature com F02/F03

O formulário fica na página de gestão do dono (F02) e funciona com ingressos comprados pela API e confirmados pelo worker (F03).

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F06-AC01 | C-F06-01, C-F06-07 |
| F06-AC02 | C-F06-02, C-F06-07 |
| F06-AC03 | C-F06-03, C-F06-07 |
| F06-AC04 | C-F06-04 |
| F06-AC05 | C-F06-05 |
| F06-AC06 | C-F06-06 |
| XF-F02-F06-01 | C-F06-08, C-F06-06 |
| XF-F03-F06-01 | C-F06-08, C-F06-03, C-F06-01 |
