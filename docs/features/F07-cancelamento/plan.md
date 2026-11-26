# F07 — Cancelamento de evento: plano

<!-- TOC -->

- [F07 — Cancelamento de evento: plano](#f07--cancelamento-de-evento-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: esqueleto de `src/domain/cancellation.ts`.
2. `cancelEvent` transacional com lock, transições de ingresso e jobs obsoletos.
3. Seção na página de gestão e rota `POST /organizer/events/:id/cancel`.
4. Testes de integração `tests/integration/cancellation.test.ts`: cancelar publicado; rascunho não cancela; cancelado some da vitrine e da API; compra pela API → `404 event_not_available`; confirmados → `refunded` e pendentes → `cancelled` em ≤ 10 s; resposta tardia do gateway (cartão `…0003`) não muda `cancelled`; edição/republicação bloqueadas; outro organizador → 404; cancelamento concorrente com rajada de compras não deixa ingresso `pending`.
5. `make gates` verde; estado `in_review`.
