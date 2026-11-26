# F07 — Cancelamento de evento: contrato

<!-- TOC -->

- [F07 — Cancelamento de evento: contrato](#f07--cancelamento-de-evento-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F07-01 — Cancelar evento publicado](#c-f07-01--cancelar-evento-publicado)
    - [C-F07-02 — Some da vitrine e da API, não vende](#c-f07-02--some-da-vitrine-e-da-api-não-vende)
    - [C-F07-03 — Transições em até 10 s](#c-f07-03--transições-em-até-10-s)
    - [C-F07-04 — Resposta tardia ignorada](#c-f07-04--resposta-tardia-ignorada)
    - [C-F07-05 — Sem edição, republicação ou cancelamento por outro](#c-f07-05--sem-edição-republicação-ou-cancelamento-por-outro)
    - [C-F07-06 — Check-in em evento cancelado](#c-f07-06--check-in-em-evento-cancelado)
    - [C-F07-07 — Cancelamento concorrente com compras](#c-f07-07--cancelamento-concorrente-com-compras)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`) com worker; organizador A e B; `API`/`KEY`.

## Itens verificáveis

### C-F07-01 — Cancelar evento publicado

Como A, `POST /organizer/events/{E3}/cancel` → `303`; a página mostra `event-status` = `Cancelado` e `event-cancelled`; novo `POST /cancel` → `409`. Rascunho → `409` `Só eventos publicados podem ser cancelados`.

### C-F07-02 — Some da vitrine e da API, não vende

Após cancelar: `GET /` não contém E3; `GET /api/partner/events` não contém E3; `POST /api/partner/events/{E3}/purchases` válido → `404 {"error":"event_not_available"}`.

### C-F07-03 — Transições em até 10 s

Com T6 `confirmed` (`…0001`) e T5 `pending` (`…0003`), cancelar → em ≤ 10 s `GET /api/partner/tickets/T6` = `refunded` e T5 = `cancelled`.

### C-F07-04 — Resposta tardia ignorada

Passados 45 s da compra de T5 (ou o vencimento do job em escala de teste), T5 continua `cancelled`; o job está `obsolete`/`done` sem efeito.

### C-F07-05 — Sem edição, republicação ou cancelamento por outro

Página de E3 sem `edit-form`, sem botão publicar e sem `cancel-button`; `POST` de edição → `422` `Evento cancelado não pode ser editado`; `POST /publish` não muda o status. Organizador B → `POST /organizer/events/{E3}/cancel` em evento publicado de A → `404` e o evento continua publicado.

### C-F07-06 — Check-in em evento cancelado

C6 (era confirmado, agora `refunded`) no check-in de E3 → `Evento cancelado`.

### C-F07-07 — Cancelamento concorrente com compras

Durante uma rajada de 30 compras, cancelar o evento: ao final nenhum ingresso do evento está `pending` ou `confirmed`.

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F07-AC01 | C-F07-01 |
| F07-AC02 | C-F07-02 |
| F07-AC03 | C-F07-03, C-F07-07 |
| F07-AC04 | C-F07-04 |
| F07-AC05 | C-F07-05 |
| XF-F02-F07-01 | C-F07-05 |
| XF-F03-F07-01 | C-F07-03, C-F07-04 |
| XF-F07-F04-01 | C-F07-02 |
| XF-F07-F05-01 | C-F07-02 |
| XF-F07-F06-01 | C-F07-06 |
