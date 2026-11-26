# Catraca

<!-- TOC -->

- [Catraca](#catraca)
  - [Como rodar](#como-rodar)
    - [Pré-requisitos](#pré-requisitos)
    - [Comandos](#comandos)
  - [Endereços](#endereços)
  - [Credenciais](#credenciais)
  - [Mapa dos artefatos](#mapa-dos-artefatos)
    - [PRs das waves](#prs-das-waves)
  - [Decisões](#decisões)

<!-- TOC -->

Venda de ingressos para eventos pequenos (shows em bar, workshops, meetups), construída **em modo agente** com Spec-Driven Development: PRD → spec/plano/contrato por feature → implementação por agentes em waves (algumas em paralelo) → avaliação independente → integração por PR.

A documentação completa está em [docs/](docs/README.md). Agentes começam por [AGENTS.md](AGENTS.md).

## Como rodar

### Pré-requisitos

- Linux (Ubuntu 22.04/24.04/26.04 amd64) ou macOS (Intel/Apple Silicon) com **Colima**.
- Docker Engine + Docker Compose v2, `git` e `make`. Node.js LTS só é necessário para os gates de documentação (`make gates`).
- Detalhes e instalação oficial por sistema: [REQUIREMENTS.md](REQUIREMENTS.md). Verificação: `make check-os && make check-dependencies`.

### Comandos

| Ação | Comando | Sem `make` |
| --- | --- | --- |
| Subir tudo (build, migração, seed, observabilidade) | `make up` | `./scripts/up.sh` |
| Derrubar tudo | `make down` | `./scripts/down.sh` |
| Gates (spec, relatórios, TOC, lint, typecheck, testes unitários e de integração) | `make gates` | `./scripts/gates.sh` |
| Testes unitários / de integração (sobem e derrubam o ambiente) | `make test-unit` / `make test-integration` | — |
| Instalar ferramentas de desenvolvimento (mise, sem nada global) | `make install` | `./scripts/install.sh` |
| Todos os alvos | `make help` | — |

Portas ocupadas? Todas são configuráveis: `APP_PORT=8081 make up` — veja [configuração](docs/operations/configuracao.md). Erros seguem o padrão `[ERRO][CÓDIGO]` com causa e solução ([troubleshooting](docs/operations/troubleshooting.md)).

## Endereços

| O quê | Endereço |
| --- | --- |
| Produto (`$WEB`) | <http://localhost:8080> |
| API de parceiros (`$API`) | <http://localhost:8080> (rotas em `/api/partner/...`) |
| Swagger / OpenAPI | <http://localhost:8080/api/docs> · <http://localhost:8080/api/openapi.json> |
| Grafana | <http://localhost:3000> (admin / admin) |
| Prometheus | <http://localhost:9090> |
| Jaeger | <http://localhost:16686> |

(As portas mudam se você definir `APP_PORT`, `GRAFANA_PORT`, etc.)

## Credenciais

| Conta | Login | Senha |
| --- | --- | --- |
| Organizador A | `organizador.a@catraca.local` | `catraca123` |
| Organizador B | `organizador.b@catraca.local` | `catraca123` |
| Participante (seed) | `participante@catraca.local` | `catraca123` |
| Chave de parceiro (`X-Api-Key`) | `catraca-partner-key-dev` | — |

```bash
export WEB=http://localhost:8080 API=http://localhost:8080 KEY=catraca-partner-key-dev
curl -s -H "X-Api-Key: $KEY" "$API/api/partner/events"
```

## Mapa dos artefatos

| Artefato | Caminho |
| --- | --- |
| Desafio (brief R01–R13) | [TASK.md](TASK.md) |
| Plano de implementação | [PLAN.md](PLAN.md) |
| PRD (features, dependências, waves, critérios) | [docs/prd/PRD.md](docs/prd/PRD.md) |
| Features: spec, plano, contrato e relatórios | [docs/features/](docs/features/) — [F01](docs/features/F01-fundacao/) · [F02](docs/features/F02-eventos/) · [F03](docs/features/F03-compra-pagamento/) · [F04](docs/features/F04-vitrine/) · [F05](docs/features/F05-api-parceiros/) · [F06](docs/features/F06-checkin/) · [F07](docs/features/F07-cancelamento/) · [F08](docs/features/F08-painel/) · [F09](docs/features/F09-observabilidade/) |
| Arquivo de estado | [state/project-state.json](state/project-state.json) |
| Porta de entrada dos agentes | [AGENTS.md](AGENTS.md) (e [CLAUDE.md](CLAUDE.md), que aponta para ele) |
| Agentes (implementador e avaliador) | [.claude/agents/](.claude/agents/) |
| Arquitetura com diagramas e analogias | [docs/architecture/](docs/architecture/) |
| Operação | [docs/operations/](docs/operations/) |
| Contribuição / requisitos | [CONTRIBUTING.md](CONTRIBUTING.md) · [REQUIREMENTS.md](REQUIREMENTS.md) |

### PRs das waves

| Wave | Features | PRs |
| --- | --- | --- |
| W1 | F01 | _a preencher_ |
| W2 (paralela) | F02 ∥ F03 | _a preencher_ |
| W3 (paralela) | F04 ∥ F05 | _a preencher_ |
| W4 (paralela) | F06 ∥ F07 | _a preencher_ |
| W5 (paralela) | F08 ∥ F09 | _a preencher_ |

## Decisões

- **Stack**: Node.js 26 LTS + TypeScript executado direto pelo Node (sem build), Fastify, HTML renderizado no servidor (EJS), PostgreSQL 18, Docker Compose. Uma linguagem para web, API, worker, seed e testes; o avaliador já tem Node; nada de frontend para compilar; Postgres dá transações e locks de linha para a regra de lotação.
- **R07 sob concorrência**: toda compra roda numa transação que trava a linha do evento (`SELECT ... FOR UPDATE`), conta `pending + confirmed` e só então insere. O mesmo lock é usado por edição de lotação e cancelamento. Um *trigger* no banco recusa qualquer inserção que ultrapasse a lotação (rede de segurança). Prova: testes com 30 compras simultâneas em eventos de lotação 5 repetidos em vários eventos novos.
- **Resposta assíncrona do gateway**: a compra cria o ingresso `pending` e um *job* de pagamento na mesma transação e responde `202` na hora. O gateway simulado decide pelo final do cartão e define quando "responde"; um **worker** separado aplica a decisão com `UPDATE ... WHERE status = 'pending'` — por isso uma resposta que chega depois do cancelamento não altera nada (R11).
- **Avaliação isolada**: cada feature é avaliada por um subagente `evaluator` de contexto vazio ([definição](.claude/agents/evaluator.md)) que só lê o contrato e o repositório, exercita cada item e grava um relatório **novo** e imutável (verificado por `make check-reports`). Quem implementa nunca escreve relatórios.
