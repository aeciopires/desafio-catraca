# F02 — Gestão de eventos: spec

<!-- TOC -->

- [F02 — Gestão de eventos: spec](#f02--gestão-de-eventos-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Consome (F01)](#consome-f01)
  - [Decisões técnicas](#decisões-técnicas)
    - [Domínio — `src/domain/events.ts`](#domínio--srcdomaineventsts)
    - [Rotas — `src/app/routes/organizer.ts` (todas com `requireOrganizer`)](#rotas--srcapproutesorganizerts-todas-com-requireorganizer)
    - [Seções extensíveis — `src/app/manage-sections.ts`](#seções-extensíveis--srcappmanage-sectionsts)
  - [Fora do escopo](#fora-do-escopo)

<!-- TOC -->

## Objetivo

Permitir que o organizador crie, edite e publique os próprios eventos, cada um com uma página de gestão de URL própria que outras features (check-in, cancelamento, painel) estendem por **seções**, sem editar os arquivos da F02.

## Regras cobertas

R01, R02, R03, R04, R13 (e a parte "não pode ser editado nem republicado" de R11).

## Consome (F01)

`withTransaction`, `lockEvent`, `countOccupiedSeats`, `availableSeats`, `requireOrganizer`, `parseLocalDateTime`, `parseReaisToCents`, `formatCents`, `newId`, `DomainError`, layout EJS.

## Decisões técnicas

### Domínio — `src/domain/events.ts`

| Função | Comportamento |
| --- | --- |
| `validateEventInput(raw, now)` | Valida `name`, `venue` (não vazios), `startsAt` (datetime-local, no futuro), `capacity` (inteiro ≥ 1), `price` (reais > 0). Retorna `{ok, value}` ou `{ok:false, errors:string[]}` |
| `createEvent(organizerId, input)` | Insere com `status='draft'` |
| `updateEvent(organizerId, eventId, input)` | Em transação com `lockEvent`: dono? (senão `not_found`); `cancelled` → `event_cancelled`; `capacity < countOccupiedSeats` → `capacity_below_occupied`; atualiza (preço novo só afeta compras futuras, pois o ingresso congela o preço — F03) |
| `publishEvent(organizerId, eventId)` | `draft → published` (`published_at`); `cancelled` → `event_cancelled`; já publicado → no-op |
| `findOwnedEvent(organizerId, eventId)` | Evento só se `organizer_id` bate; senão `null` |
| `listOrganizerEvents(organizerId)` | Lista do organizador, mais recentes primeiro |
| `listPublishedEvents()` | `status='published'`, ordenado por `starts_at`, com `availableSeats` (R05) calculado em uma query |
| `getPublishedEvent(eventId)` | Um evento publicado com `availableSeats`, ou `null` |

Mensagens de validação (exatas):

- `Preencha o nome do evento` / `Preencha o local do evento`
- `A data de início precisa estar no futuro`
- `A lotação deve ser um número inteiro maior ou igual a 1`
- `O preço deve ser maior que zero`
- `A lotação não pode ser menor que as vagas ocupadas (N)`
- `Evento cancelado não pode ser editado`
- `Evento cancelado não pode ser publicado` (publicação de evento cancelado → `422`, status inalterado)

### Rotas — `src/app/routes/organizer.ts` (todas com `requireOrganizer`)

| Rota | Resposta |
| --- | --- |
| `GET /organizer/events` | Lista do organizador; cada linha `data-testid="org-event-row"` com nome, status e link |
| `GET /organizer/events/new` | Formulário (`name`, `startsAt` datetime-local, `venue`, `capacity`, `price`) |
| `POST /organizer/events` | Válido → `303 /organizer/events/{id}`; inválido → `422` com `data-testid="form-error"` |
| `GET /organizer/events/{id}` | Página de gestão (dono) ou `404` "Evento não encontrado" sem nenhum dado |
| `POST /organizer/events/{id}` | Edição; sucesso → `303` para a página com `?ok=updated`; erro → `422` com `form-error` |
| `POST /organizer/events/{id}/publish` | `303` para a página com `?ok=published` |

Página de gestão (`views/organizer/manage.ejs`): título `data-testid="event-name"`, status `data-testid="event-status"` (`Rascunho`/`Publicado`/`Cancelado`), *flash* `data-testid="flash"`, formulário de edição `data-testid="edit-form"` (oculto se cancelado), botão publicar (só rascunho), e as seções registradas.

### Seções extensíveis — `src/app/manage-sections.ts`

```ts
export interface ManageSection {
  id: string;            // 'checkin' | 'cancellation' | 'dashboard'
  order: number;         // render order on the page
  view: string;          // EJS template path relative to src/app/views
  load(ctx: { event: EventRow; organizerId: string }): Promise<Record<string, unknown>>;
  register?(app: FastifyInstance): void; // extra POST routes (already behind requireOrganizer)
}
export function renderManagePage(reply, event, extras?: Record<string, unknown>, statusCode = 200);
```

A F02 cria os arquivos `src/app/sections/{checkin,cancellation,dashboard}.ts` exportando `section: ManageSection | null = null` (*stubs*) e `src/app/sections/index.ts` que os agrega. F06, F07 e F08 só preenchem o seu arquivo e a sua view — sem conflito com a F02.

## Fora do escopo

Compra, vitrine, cancelamento (F07), check-in (F06), painel (F08).
