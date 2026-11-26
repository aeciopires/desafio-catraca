# F07 — Cancelamento de evento: spec

<!-- TOC -->

- [F07 — Cancelamento de evento: spec](#f07--cancelamento-de-evento-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome](#consome)
  - [Decisões técnicas](#decisões-técnicas)
    - [Domínio — `src/domain/cancellation.ts`](#domínio--srcdomaincancellationts)
    - [Seção — `src/app/sections/cancellation.ts` + `views/sections/cancellation.ejs`](#seção--srcappsectionscancellationts--viewssectionscancellationejs)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Cancelar um evento publicado de forma irreversível e coerente com todas as outras features: some da vitrine e da API, para de vender, não é mais editável e os ingressos mudam de status na hora.

## Regras cobertas

R11, R02, R13.

## Consome

- F02: `ManageSection`, `renderManagePage`, bloqueio de edição/publicação de evento `cancelled`, `listPublishedEvents` (que já filtra `published`).
- F03: `lockEvent` (mesmo lock da compra), `payment_jobs`, regra do worker "só altera `pending`".

## Decisões técnicas

### Domínio — `src/domain/cancellation.ts`

`cancelEvent(organizerId, eventId) → { refunded: number; cancelled: number }` em **uma transação**:

1. `lockEvent` (serializa com compras em andamento); não é do organizador → `not_found`.
2. `status <> 'published'` → `DomainError('not_cancellable', 'Só eventos publicados podem ser cancelados')`.
3. `UPDATE events SET status='cancelled', cancelled_at=now()`.
4. `UPDATE tickets SET status='refunded' WHERE event_id=$1 AND status='confirmed'`.
5. `UPDATE tickets SET status='cancelled' WHERE event_id=$1 AND status='pending'`.
6. `UPDATE payment_jobs SET state='obsolete' WHERE state='scheduled' AND ticket_id IN (...)`.

Tudo acontece no `COMMIT` (muito abaixo dos 10 s). Se o worker já tiver lido o job antes, o `UPDATE ... WHERE status='pending'` dele não encontra a linha: a resposta tardia é ignorada.

### Seção — `src/app/sections/cancellation.ts` + `views/sections/cancellation.ejs`

- `order: 90`. Evento publicado: botão `data-testid="cancel-button"` (form `POST /organizer/events/:id/cancel`, com `confirm()` no navegador). Evento cancelado: aviso `data-testid="event-cancelled"` "Evento cancelado em <data>. Esta ação é irreversível."
- `register(app)`: `POST /organizer/events/:id/cancel` → dono (404 se não for) → `cancelEvent` → `303` para a página com `?ok=cancelled`; `not_cancellable` → `409` com `form-error`.

## Fora do escopo

Reembolso real, notificação dos compradores, cancelamento de ingresso individual.
