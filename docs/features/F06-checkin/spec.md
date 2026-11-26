# F06 — Check-in: spec

<!-- TOC -->

- [F06 — Check-in: spec](#f06--check-in-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome](#consome)
  - [Decisões técnicas](#decisões-técnicas)
    - [Domínio — `src/domain/checkin.ts`](#domínio--srcdomaincheckints)
    - [Seção — `src/app/sections/checkin.ts` + `src/app/views/sections/checkin.ejs`](#seção--srcappsectionscheckints--srcappviewssectionscheckinejs)
  - [Desvios registrados na implementação](#desvios-registrados-na-implementação)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Validar a entrada pelo código do ingresso na página de gestão do evento, com as mensagens exatas e a ordem de R10.

## Regras cobertas

R10, R13 (e a interação com R11: `Evento cancelado`).

## Consome

- F02: `ManageSection`, `renderManagePage`, `findOwnedEvent` (já aplicado pela F02 antes de chamar a seção).
- F03: tabela `tickets` (status, `checked_in`), `findTicketByCode`.

## Decisões técnicas

### Domínio — `src/domain/checkin.ts`

```ts
export const CHECKIN_MESSAGES = {
  invalid: 'Ingresso inválido para este evento',
  cancelled: 'Evento cancelado',
  notConfirmed: 'Ingresso não confirmado',
  alreadyUsed: 'Ingresso já utilizado',
  ok: 'Entrada liberada',
} as const;
checkIn(eventId: string, rawCode: string): Promise<{ result: keyof typeof CHECKIN_MESSAGES; message: string }>
```

Em transação: normaliza o código (`trim().toUpperCase()`); `SELECT ... FROM tickets WHERE code=$1 FOR UPDATE`; lê o evento. Primeira condição verdadeira, **na ordem**:

1. ingresso não existe ou `ticket.event_id <> eventId` → `invalid`
2. `event.status = 'cancelled'` → `cancelled`
3. `ticket.status <> 'confirmed'` → `notConfirmed`
4. `ticket.checked_in` → `alreadyUsed`
5. senão `UPDATE tickets SET checked_in = true, checked_in_at = now()` → `ok`

O `FOR UPDATE` evita dois check-ins simultâneos do mesmo código liberarem duas entradas.

### Seção — `src/app/sections/checkin.ts` + `src/app/views/sections/checkin.ejs`

- `order: 20`. Formulário `data-testid="checkin-form"` (campo `code`) sempre exibido, inclusive em evento cancelado (vale a lista).
- `register(app)`: `POST /organizer/events/:id/checkin` → valida dono (404 se não for), chama `checkIn` e responde `200` com `renderManagePage(reply, event, { checkinResult })`; o resultado aparece em `data-testid="checkin-result"` com a mensagem exata.

## Desvios registrados na implementação

Decisões tomadas durante a implementação e aceitas na avaliação independente. Nenhuma altera o comportamento exigido pelo contrato.

| Tema | Implementado | Motivo |
| --- | --- | --- |
| 404 para quem não é dono | Mesma página genérica das rotas do organizador, renderizada na seção | O helper da F02 é privado; importá-lo criaria ciclo de imports |
| Código vazio | `200` com "Ingresso inválido para este evento" (o campo HTML é `required`) | Cai na regra 1 de R10 |
| `data-testid` extras | `checkin-code`, `checkin-button` e o atributo `data-result` no resultado | Testes |

## Fora do escopo

Leitura de QR code, desfazer check-in.
