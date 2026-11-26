# F01 — Fundação: spec

<!-- TOC -->

- [F01 — Fundação: spec](#f01--fundação-spec)
  - [Objetivo](#objetivo)
  - [Regras cobertas](#regras-cobertas)
  - [Decisões técnicas](#decisões-técnicas)
  - [Schema (migração `001_init.sql`)](#schema-migração-001initsql)
  - [Contratos internos (Provides)](#contratos-internos-provides)
  - [Seed](#seed)
  - [Harness](#harness)
  - [Fora do escopo da F01](#fora-do-escopo-da-f01)

<!-- TOC -->

## Objetivo

Entregar o ambiente reproduzível (harness), o schema completo do banco, contas/autenticação e os **contratos internos** que todas as outras features consomem. O schema inteiro nasce aqui para que as waves paralelas não disputem migrações.

## Regras cobertas

R13 (papéis e acesso à área de organizador), R05 (helpers de vagas usados por F02/F03/F05/F08).

## Decisões técnicas

| Tema | Decisão |
| --- | --- |
| Runtime | Node.js 26 LTS executando TypeScript direto (*type stripping* nativo): sem etapa de build. Só sintaxe "apagável" (`erasableSyntaxOnly`): nada de `enum`, `namespace` ou *parameter properties*. Imports relativos com extensão `.ts`. |
| HTTP | Fastify 5; `@fastify/formbody` (formulários), `@fastify/cookie` (cookie assinado), `@fastify/view` + EJS (HTML no servidor). |
| Banco | PostgreSQL 18; `pg` com SQL explícito; migrações em `src/db/migrations/NNN_nome.sql`, aplicadas em ordem por `src/db/migrate.ts` com tabela `schema_migrations` e *advisory lock* (idempotente). |
| Seed | `src/db/seed.ts`, upsert por e-mail/nome: organizador A, organizador B, participante, parceiro. Rodada pelo serviço `migrate` do Compose em toda subida. |
| Senha | `bcryptjs` (JS puro: funciona em amd64 e arm64 sem compilação). |
| Sessão | Tabela `sessions` (id aleatório de 32 bytes, `user_id`, `expires_at` 7 dias); cookie `sid` `HttpOnly`, `SameSite=Lax`, assinado. |
| Horário | Entrada `datetime-local` interpretada em UTC−03:00 (Brasília, sem horário de verão); saída ISO com offset `-03:00`. |
| Dinheiro | Inteiro em centavos (`price_cents`). Entrada aceita `100`, `100,00`, `100.00`, `1.234,56`. Exibição `R$ 1.234,56`. |
| IDs | `evt_`, `tkt_`, `usr_`, `pay_`, `prt_` + 10 caracteres base32 minúsculos aleatórios (`crypto.randomBytes`). Código do ingresso: 8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. |
| Contêineres | Uma imagem (`docker/app.Dockerfile`) para `app`, `worker` e `migrate`; estágio `dev` com devDependencies para o serviço `tools` (lint, typecheck, testes). O host só precisa de Docker + make. |
| Testes | Vitest com dois projetos (`unit`, `integration`) em `vitest.config.ts`; integração roda no serviço `tools` contra `http://app:8080`. |

## Schema (migração `001_init.sql`)

```sql
users(id text pk, name text, email text unique (lower), password_hash text,
      role text check in ('participant','organizer'), created_at timestamptz)
sessions(id text pk, user_id text fk users, expires_at timestamptz)
partners(id text pk, name text unique, api_key_hash text unique)   -- sha256 hex da chave
events(id text pk, organizer_id text fk users, name text, starts_at timestamptz, venue text,
       capacity int check >= 1, price_cents int check > 0,
       status text check in ('draft','published','cancelled'),
       created_at, updated_at, published_at, cancelled_at)
tickets(id text pk, event_id text fk events, code text unique, status text check in
        ('pending','confirmed','declined','cancelled','refunded'), checked_in bool default false,
        checked_in_at, price_cents int, channel text check in ('web','partner'),
        buyer_user_id text null fk users, buyer_email text, partner_id text null fk partners,
        card_last4 text, created_at, updated_at)
payment_jobs(id text pk, ticket_id text unique fk tickets, card_last4 text, decision text check in
             ('approved','declined'), due_at timestamptz, state text check in
             ('scheduled','done','obsolete'), created_at, processed_at)
index tickets(event_id, status); index payment_jobs(state, due_at); index events(status)
```

Defesa em profundidade para R07: *trigger* `tickets_capacity_guard` (`BEFORE INSERT OR UPDATE OF status`) que, quando o ingresso entra em `pending`/`confirmed`, conta as vagas ocupadas do evento e levanta erro `check_violation` se passarem da lotação. O caminho normal (lock do evento) nunca dispara o trigger; ele existe para pegar bugs.

## Contratos internos (Provides)

Toda feature consome estes módulos; **não reimplementar**.

| Módulo | Exporta |
| --- | --- |
| `src/config.ts` | `config` (porta, `DATABASE_URL`, `SESSION_SECRET`, `GATEWAY_DELAY_SCALE`, `WORKER_POLL_MS`, `OTEL_*`, `LOG_LEVEL`) |
| `src/db/pool.ts` | `pool`, `query(sql, params)`, `withTransaction(fn(client))` |
| `src/domain/seats.ts` | `lockEvent(client, eventId) → EventRow \| null` (`SELECT ... FOR UPDATE`); `countOccupiedSeats(client, eventId) → number` (`pending`+`confirmed`); `availableSeats(event, occupied) → number` (0 se cancelado) |
| `src/domain/types.ts` | tipos `EventRow`, `TicketRow`, `UserRow`, `TicketStatus`, `EventStatus` |
| `src/lib/ids.ts` | `newId(prefix)`, `newTicketCode()` |
| `src/lib/money.ts` | `parseReaisToCents(text) → number \| null`, `formatCents(cents) → "R$ 1.234,56"` |
| `src/lib/time.ts` | `parseLocalDateTime(value) → Date \| null`, `toIsoOffset(date) → "2026-12-05T21:00:00-03:00"`, `toLocalInput(date)`, `formatDateTimeBR(date)` |
| `src/lib/errors.ts` | `DomainError(code, message)` com `code` estável |
| `src/app/auth.ts` | `request.user` (`{id,name,email,role} \| null`), preHandlers `requireParticipant`, `requireOrganizer` (visitante → 302 `/login?next=`; papel errado → 403 "Acesso restrito") |
| `src/app/server.ts` | `buildApp()`; registra os plugins de rota já existentes como *stubs*: `routes/auth.ts` (F01), `routes/organizer.ts` (F02), `routes/showcase.ts` (F04), `routes/partner.ts` (F05), `routes/docs.ts` (F05) |
| `src/app/views/` | `partials/header.ejs`, `partials/footer.ejs` (layout); `reply.locals.user` disponível em toda view |
| `tests/integration/helpers.ts` | `BASE_URL`, `WebClient` (cookie jar, `get`, `postForm`), `loginAs(email, senha)`, `partner(method, path, body?, key?)`, `testId(html, id)`, `futureLocal(days)`, `SEED` (credenciais), `waitFor(fn, timeoutMs)` |

Convenção de HTML para testes: valores que o avaliador confere ficam em elementos com `data-testid` (ex.: `data-testid="flash"`, `data-testid="dash-confirmed"`).

## Seed

| Conta | E-mail | Senha |
| --- | --- | --- |
| Organizador A | `organizador.a@catraca.local` | `catraca123` |
| Organizador B | `organizador.b@catraca.local` | `catraca123` |
| Participante | `participante@catraca.local` | `catraca123` |
| Parceiro | nome `Parceiro Demo` | chave `catraca-partner-key-dev` (header `X-Api-Key`) |

## Harness

- `make up`: `check-os` → `check-deps --runtime` → `check-ports` → `docker compose build` → `up -d --wait` (com `migrate` concluído antes de `app`/`worker`) → imprime URLs e credenciais. Falhas usam o padrão `[ERRO][CÓDIGO]` e mostram o log do serviço que falhou.
- `make down`: `docker compose --profile "*" down --remove-orphans` e verifica que as portas não respondem.
- `make gates`: `lint`, `typecheck`, `check-spec`, `check-reports`, `toc-check`, `test-unit`, `test-integration` (todos em contêiner).
- Fallback sem `make`: `./scripts/up.sh`, `./scripts/down.sh`, `./scripts/gates.sh`.

## Fora do escopo da F01

Eventos, compra, check-in, cancelamento, painel e observabilidade (somente *stubs* de rota e o schema).
