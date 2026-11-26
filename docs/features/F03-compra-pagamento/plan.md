# F03 — Núcleo de compra e pagamento: plano

<!-- TOC -->

- [F03 — Núcleo de compra e pagamento: plano](#f03--núcleo-de-compra-e-pagamento-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: interfaces de `src/gateway/payment-gateway.ts` e esqueleto de `src/domain/purchase.ts`.
2. Gateway simulado com a tabela de finais e `GATEWAY_DELAY_SCALE`; testes unitários da tabela e das faixas de atraso.
3. `purchaseTicket` com validação de cartão, lock, checagem de vaga, código único, preço congelado e job de pagamento.
4. Worker (`processDuePayments` + laço em `src/worker/main.ts`) com update condicional `status='pending'`.
5. `src/domain/tickets.ts` (consultas e rótulos).
6. Testes de integração (domínio contra o Postgres do Compose): pendente → confirmado/recusado, vaga liberada na recusa, preço congelado, cartão inválido não cria nada, worker não altera ticket não-pendente, concorrência 20 × (30 compras, lotação 5) e 200 concorrentes.
7. `make gates` verde; estado `in_review`.
