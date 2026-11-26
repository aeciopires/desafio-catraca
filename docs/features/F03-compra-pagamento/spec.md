# F03 — Núcleo de compra e pagamento: spec

<!-- TOC -->

- [F03 — Núcleo de compra e pagamento: spec](#f03--núcleo-de-compra-e-pagamento-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome (F01)](#consome-f01)
  - [Decisões técnicas](#decisões-técnicas)
    - [`src/domain/purchase.ts`](#srcdomainpurchasets)
    - [Gateway simulado — `src/gateway/`](#gateway-simulado--srcgateway)
    - [Worker — `src/worker/payment-worker.ts` e `src/worker/main.ts`](#worker--srcworkerpayment-workerts-e-srcworkermaints)
    - [Consultas — `src/domain/tickets.ts`](#consultas--srcdomainticketsts)
  - [Prova de R07](#prova-de-r07)
  - [Desvios registrados na implementação](#desvios-registrados-na-implementação)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Ser o **único** caminho de compra de ingresso (vitrine e API) e o único lugar que muda o status do ingresso por causa do gateway. É aqui que as regras de vaga (R05, R07) e de pagamento (R06, R08) vivem.

## Regras cobertas

R03 (preço congelado), R05, R06, R07, R08, R09, R11 (worker ignora resposta tardia).

## Consome (F01)

`withTransaction`, `lockEvent`, `countOccupiedSeats`, `newId`, `newTicketCode`, `DomainError`, `config.GATEWAY_DELAY_SCALE`, `config.WORKER_POLL_MS`, serviço `worker` do Compose.

## Decisões técnicas

### `src/domain/purchase.ts`

```ts
purchaseTicket(input: {
  eventId: string;
  channel: 'web' | 'partner';
  buyerEmail: string;
  buyerUserId?: string | null;
  partnerId?: string | null;
  cardNumber: string;
}): Promise<TicketRow>
```

Ordem: (1) `cardNumber` precisa casar `^\d{16}$` → senão `DomainError('invalid_card')`, nada é criado; (2) transação: `lockEvent` (`SELECT ... FOR UPDATE`); inexistente ou `status <> 'published'` → `event_not_available`; (3) `countOccupiedSeats >= capacity` → `sold_out`; (4) `INSERT tickets` (`pending`, código único, `price_cents` = preço vigente, `card_last4`); (5) `gateway.submit()` decide e agenda: `INSERT payment_jobs` (`decision`, `due_at = now() + delay`); (6) `COMMIT`. A resposta não espera o gateway.

Colisão de código (`unique_violation` em `tickets.code`) → nova tentativa com outro código (até 5).

### Gateway simulado — `src/gateway/`

- `payment-gateway.ts`: interface `PaymentGateway { submit(req: {ticketId, cardNumber}): {decision: 'approved'|'declined'; delayMs: number} }` (ponto de troca por um gateway real).
- `simulated-gateway.ts`: tabela por final do cartão (atrasos dentro das faixas do brief, com folga para o polling):

| Final | Decisão | Atraso (ms × `GATEWAY_DELAY_SCALE`) |
| --- | --- | --- |
| `0001` | approved | 2000–4500 |
| `0002` | declined | 2000–4500 |
| `0003` | approved | 30000–39000 |
| `0004` | declined | 30000–39000 |
| outro | declined | 2000–4500 |

### Worker — `src/worker/payment-worker.ts` e `src/worker/main.ts`

`processDuePayments(limit=50)`: em transação, `SELECT ... FROM payment_jobs WHERE state='scheduled' AND due_at <= now() ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT $1`; para cada job, `UPDATE tickets SET status = (approved → 'confirmed' | declined → 'declined') WHERE id = $1 AND status = 'pending'` (**só altera pendente**: cancelado/estornado nunca voltam) e `UPDATE payment_jobs SET state='done', processed_at=now()`. Laço a cada `WORKER_POLL_MS` (padrão 200 ms); encerra limpo em SIGTERM.

Recusa libera a vaga automaticamente: vaga ocupada é derivada de `status IN ('pending','confirmed')`.

### Consultas — `src/domain/tickets.ts`

`findTicketById(id)`, `findTicketByCode(code)`, `listTicketsForUser(userId)` (com nome/data do evento), `TICKET_STATUS_LABEL` (`pending→pendente`, `confirmed→confirmado`, `declined→recusado`, `cancelled→cancelado`, `refunded→estornado`).

## Prova de R07

- Lock pessimista por evento serializa compra, edição de lotação e cancelamento.
- Trigger `tickets_capacity_guard` (F01) como rede de segurança.
- Testes: 30 compras concorrentes × lotação 5 em 20 eventos novos (sempre 5 ingressos); 200 concorrentes em lotação 37.

## Desvios registrados na implementação

Decisões tomadas durante a implementação e aceitas na avaliação independente. Nenhuma altera o comportamento exigido pelo contrato.

| Tema | Spec original | Implementado | Motivo |
| --- | --- | --- | --- |
| Horário da resposta | `due_at = now() + delay` | `clock_timestamp() + delay` | `now()` é o início da transação; uma compra que esperou o lock do evento teria a resposta antecipada |
| Colisão de código | até 5 tentativas | até 5 tentativas com `SAVEPOINT`; na 5ª o erro original (`23505`) é relançado e nada é criado | Mantém a transação válida entre tentativas |
| Log | — | `ticket purchased (pending)` (info) | Diagnóstico e correlação com traces |

## Fora do escopo

Rotas HTTP (F04/F05), cancelamento (F07), painel (F08).
