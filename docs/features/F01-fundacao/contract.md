# F01 — Fundação: contrato

<!-- TOC -->

- [F01 — Fundação: contrato](#f01--fundação-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F01-01 — Subida a partir de clone limpo](#c-f01-01--subida-a-partir-de-clone-limpo)
    - [C-F01-02 — Derrubar encerra tudo](#c-f01-02--derrubar-encerra-tudo)
    - [C-F01-03 — Subir de novo (seed idempotente)](#c-f01-03--subir-de-novo-seed-idempotente)
    - [C-F01-04 — Gates](#c-f01-04--gates)
    - [C-F01-05 — Cadastro, login e logout de participante](#c-f01-05--cadastro-login-e-logout-de-participante)
    - [C-F01-06 — Acesso à área de organizador](#c-f01-06--acesso-à-área-de-organizador)
    - [C-F01-07 — Seed](#c-f01-07--seed)
    - [C-F01-08 — Mensagens de erro do harness](#c-f01-08--mensagens-de-erro-do-harness)
    - [C-F01-09 — Cross-feature (preparação)](#c-f01-09--cross-feature-preparação)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Linux (Ubuntu 22.04/24.04/26.04 amd64) ou macOS com Colima; Docker + Compose v2; `make`, `curl`, `git`.
- Portas livres: `APP_PORT` (padrão 8080) e, com observabilidade, 3000/9090/16686/3100 (ou variáveis ajustadas).
- `export WEB=http://localhost:${APP_PORT:-8080}`.

## Itens verificáveis

### C-F01-01 — Subida a partir de clone limpo

`git clone <repo> /tmp/catraca-eval && cd /tmp/catraca-eval && make up` termina com código 0, sem outro passo; `curl -s -o /dev/null -w '%{http_code}' $WEB/` → `200`; `curl -s $WEB/healthz` → `{"status":"ok"}`.

### C-F01-02 — Derrubar encerra tudo

`make down` termina com 0; `docker ps --filter label=com.docker.compose.project=catraca -q` vazio; `curl -s -m 2 $WEB/` falha (conexão recusada).

### C-F01-03 — Subir de novo (seed idempotente)

Após C-F01-02, `make up` termina com 0 e o login de `organizador.a@catraca.local` / `catraca123` funciona.

### C-F01-04 — Gates

`make gates` termina com 0 e a saída mostra testes unitários e de integração executados (contagem > 0).

### C-F01-05 — Cadastro, login e logout de participante

Teste `tests/integration/auth.test.ts` passa: cadastro (nome, e-mail, senha) → sessão ativa (`data-testid="current-user"` mostra o nome); logout encerra; e-mail duplicado → mensagem `E-mail já cadastrado`; não existe rota de cadastro de organizador (`/signup` sempre cria `participant`).

### C-F01-06 — Acesso à área de organizador

`curl -s -o /dev/null -w '%{http_code} %{redirect_url}' $WEB/organizer/events` → `302 .../login?next=...`; como participante da seed, a mesma URL → `403` com "Acesso restrito"; como organizador A → `200`.

### C-F01-07 — Seed

`docker compose -p catraca run --rm migrate` duas vezes seguidas termina com 0; cada e-mail da seed e o parceiro existem exatamente uma vez (`SELECT email, count(*) FROM users WHERE email LIKE '%@catraca.local' GROUP BY email` → 3 linhas com 1).

### C-F01-08 — Mensagens de erro do harness

Com a porta ocupada (`python3 -m http.server 8080` ou `nc -l 8080`), `make up` falha com `[ERRO][PORT-001]` citando `APP_PORT`; `APP_PORT=8091 make up` funciona. `ALLOW_UNSUPPORTED_OS` documentado; `bash scripts/check-os.sh` imprime `[OK]` no SO suportado.

### C-F01-09 — Cross-feature (preparação)

`tests/integration/foundation.test.ts` verifica: organizador da seed acessa `/organizer/events` (200) e participante da seed recebe 403; serviço `worker` aparece em `docker compose -p catraca ps` como `running`.

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F01-AC01 | C-F01-01 |
| F01-AC02 | C-F01-02, C-F01-03 |
| F01-AC03 | C-F01-04 |
| F01-AC04 | C-F01-05 |
| F01-AC05 | C-F01-06 |
| F01-AC06 | C-F01-07, C-F01-03 |
| F01-AC07 | C-F01-08 |
| XF-F01-F02-01 | C-F01-09, C-F01-06 |
