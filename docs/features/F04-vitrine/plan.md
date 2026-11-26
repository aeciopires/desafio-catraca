# F04 — Vitrine e área do participante: plano

<!-- TOC -->

- [F04 — Vitrine e área do participante: plano](#f04--vitrine-e-área-do-participante-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: rota `GET /` mínima e views vazias.
2. Vitrine e página do evento (esgotado no lugar da compra).
3. Compra (`POST /events/{id}/purchase`) usando somente `purchaseTicket` da F03; mapeamento de erros.
4. "Meus ingressos" com rótulos de status.
5. Testes de integração `tests/integration/showcase.test.ts`: rascunho fora/publicado dentro, compra → pendente → confirmado em ≤ 5 s (escala real) ou `waitFor` (escala de teste), esgotado após compra pela API (chamando `purchaseTicket` com `channel:'partner'`), recusa libera vaga, cartão inválido, visitante redirecionado.
6. `make gates` verde; estado `in_review`.
