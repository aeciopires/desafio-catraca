# F04 — Vitrine e área do participante: spec

<!-- TOC -->

- [F04 — Vitrine e área do participante: spec](#f04--vitrine-e-área-do-participante-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome](#consome)
  - [Decisões técnicas](#decisões-técnicas)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Interface pública de venda: vitrine, página do evento com compra e "Meus ingressos".

## Regras cobertas

R02, R05, R06, R07, R08, R09.

## Consome

- F01: sessão, `requireParticipant`, layout, `formatCents`, `formatDateTimeBR`.
- F02: `listPublishedEvents()`, `getPublishedEvent(id)` (já com `availableSeats`).
- F03: `purchaseTicket({channel:'web', buyerUserId, buyerEmail: user.email, cardNumber})`, `listTicketsForUser`, `TICKET_STATUS_LABEL`.

## Decisões técnicas

Arquivo único de rotas: `src/app/routes/showcase.ts` (o *stub* da F01). Views em `src/app/views/showcase/`.

| Rota | Comportamento |
| --- | --- |
| `GET /` | Vitrine (sem login): cada evento em `data-testid="showcase-event"` com `data-event-id`, nome, data, local, preço e vagas disponíveis; link para `/events/{id}` |
| `GET /events/{id}` | Só evento publicado (senão `404`). Se `availableSeats = 0`: `<p data-testid="sold-out">Ingressos esgotados</p>` **no lugar** do formulário. Senão: participante logado vê formulário `data-testid="purchase-form"` (`cardNumber`); visitante vê link "Entre para comprar" (`/login?next=/events/{id}`); organizador vê aviso "Apenas participantes compram ingressos" |
| `POST /events/{id}/purchase` | `requireParticipant`. Sucesso → `303 /me/tickets?ok=purchased`. `sold_out` → `409` com a página do evento exibindo `Ingressos esgotados` (`data-testid="sold-out"`). `invalid_card` → `422` com `data-testid="form-error"` `O número do cartão deve ter 16 dígitos`. `event_not_available` → `404` |
| `GET /me/tickets` | `requireParticipant`. Uma linha `data-testid="ticket-row"` por ingresso (mais recente primeiro) com `ticket-event` (nome), `ticket-status` (rótulo pt-BR: pendente/confirmado/recusado/cancelado/estornado) e `ticket-code` |

O cabeçalho (F01) mostra links "Vitrine", "Meus ingressos" (participante) e "Meus eventos" (organizador).

## Fora do escopo

API de parceiros (F05), atualização em tempo real (recarregar basta).
