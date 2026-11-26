# F06 — Check-in: plano

<!-- TOC -->

- [F06 — Check-in: plano](#f06--check-in-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: `CHECKIN_MESSAGES` e esqueleto de `checkIn`.
2. Implementar `checkIn` com a ordem de R10 e lock do ingresso.
3. Seção na página de gestão (formulário + resultado) e rota `POST /organizer/events/:id/checkin`.
4. Testes unitários da função de decisão pura (`decideCheckin(ticket, event)`) cobrindo a ordem (ex.: cancelado + não confirmado → `Evento cancelado`).
5. Testes de integração `tests/integration/checkin.test.ts`: as 5 mensagens, código de outro evento, check-in em evento cancelado (status forçado via SQL se a F07 ainda não estiver na `main`), outro organizador → 404, concorrência de check-in do mesmo código (só um `Entrada liberada`).
6. `make gates` verde; estado `in_review`.
