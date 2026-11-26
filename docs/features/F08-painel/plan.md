# F08 — Painel do evento: plano

<!-- TOC -->

- [F08 — Painel do evento: plano](#f08--painel-do-evento-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: esqueleto de `src/domain/dashboard.ts`.
2. Query agregada e cálculo de vagas.
3. Seção e view com `data-testid`.
4. Testes unitários de montagem do painel (cancelado → vagas 0; receita só confirmados).
5. Testes de integração `tests/integration/dashboard.test.ts`: cenário do passo 9 (Confirmados 3, Receita R$ 350,00 com mudança de preço), passo 10 (Check-ins 1), passo 14 (após cancelamento: Estornados 1, Receita R$ 0,00), passo 15 (Confirmados 5 / Vagas 0), vitrine + API somadas, painel invisível para outro organizador.
6. `make gates` verde; estado `in_review`.
