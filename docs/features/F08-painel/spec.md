# F08 — Painel do evento: spec

<!-- TOC -->

- [F08 — Painel do evento: spec](#f08--painel-do-evento-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome](#consome)
  - [Decisões técnicas](#decisões-técnicas)
    - [Domínio — `src/domain/dashboard.ts`](#domínio--srcdomaindashboardts)
    - [Seção — `src/app/sections/dashboard.ts` + `views/sections/dashboard.ejs`](#seção--srcappsectionsdashboardts--viewssectionsdashboardejs)
  - [Desvios registrados na implementação](#desvios-registrados-na-implementação)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Mostrar na página de gestão os seis números de R12, calculados **a partir do estado dos ingressos** (vitrine e API), nunca de contadores paralelos.

## Regras cobertas

R12, R05, R03, R13.

## Consome

- F02: `ManageSection`, `renderManagePage`.
- F03: `tickets.price_cents` (preço congelado), status.
- F06: `tickets.checked_in`.
- F07: status `refunded` e evento `cancelled`.
- F01: `availableSeats`, `formatCents`.

## Decisões técnicas

### Domínio — `src/domain/dashboard.ts`

`getDashboard(eventId) → { confirmed, pending, checkins, available, revenueCents, refunded }` com uma única query agregada:

```sql
SELECT
  count(*) FILTER (WHERE status = 'confirmed')                 AS confirmed,
  count(*) FILTER (WHERE status = 'pending')                   AS pending,
  count(*) FILTER (WHERE status = 'confirmed' AND checked_in)  AS checkins,
  count(*) FILTER (WHERE status = 'refunded')                  AS refunded,
  coalesce(sum(price_cents) FILTER (WHERE status = 'confirmed'), 0) AS revenue_cents
FROM tickets WHERE event_id = $1
```

`available = availableSeats(event, confirmed + pending)` (0 se cancelado). Receita conta **só** `confirmed`: estorno nunca é receita.

### Seção — `src/app/sections/dashboard.ts` + `views/sections/dashboard.ejs`

`order: 10` (primeira das seções da página de gestão, logo após os dados e o formulário de edição do evento). Elementos: `dash-confirmed`, `dash-pending`, `dash-checkins`, `dash-available`, `dash-revenue` (formato `R$ 350,00`), `dash-refunded`, cada um com rótulo em pt-BR (Confirmados, Pendentes, Check-ins, Vagas disponíveis, Receita, Estornados).

## Desvios registrados na implementação

Decisões tomadas durante a implementação e aceitas na avaliação independente. Nenhuma altera o comportamento exigido pelo contrato.

| Tema | Spec original | Implementado | Motivo |
| --- | --- | --- | --- |
| Assinatura | `getDashboard(eventId)` | `getDashboard(event: EventRow)` + função pura `buildDashboard(counts, event)` | Lotação e status do evento são necessários para as vagas; a função pura é testada sem banco |
| Posição | topo da página | primeira das seções, depois dos dados e do formulário de edição | Ordem de renderização da página de gestão (F02) |

## Fora do escopo

Gráficos, exportação, atualização em tempo real.
