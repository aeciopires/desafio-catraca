# F01 — Fundação: plano

<!-- TOC -->

- [F01 — Fundação: plano](#f01--fundação-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. **Dockerfile e Compose**: `docker/app.Dockerfile` (estágios `base`, `deps`, `dev`, `prod-deps`, `runtime`), `docker-compose.yml` com `postgres`, `migrate`, `app`, `worker` (stub), `tools` (perfil `tools`). Healthchecks em `postgres` e `app`.
2. **Config e banco**: `src/config.ts`, `src/db/pool.ts`, `src/db/migrate.ts`, `src/db/migrations/001_init.sql` (schema completo + trigger de lotação), `src/db/seed.ts`, `src/db/setup.ts` (migrate + seed).
3. **Bibliotecas**: `src/lib/{ids,money,time,errors}.ts`, `src/domain/{types,seats}.ts`.
4. **App**: `src/app/server.ts`, `src/app/auth.ts`, rotas `auth.ts` (signup, login, logout), *stubs* `organizer.ts`, `showcase.ts`, `partner.ts`, `docs.ts`; views de layout, login, cadastro, 403, 404; `/healthz` e `/readyz`.
5. **Worker stub**: `src/worker/main.ts` que só inicia, loga e responde a SIGTERM (F03 preenche).
6. **Harness**: Makefile completo, `scripts/{up,down,gates,wait-healthy,install,check-reports}.sh`, `.env.example`.
7. **Testes**: `vitest.config.ts`, unitários de `money`, `time`, `ids`, `seats.availableSeats`; integração de cadastro/login/logout, acesso à área de organizador, seed idempotente; helpers de teste.
8. **Docs**: README inicial (como rodar, endereços, credenciais), `docs/operations/configuracao.md`, `docs/operations/troubleshooting.md`.
9. **Gates**: `make gates` verde; `make down` + `make up` de novo verde.
