# Como contribuir

<!-- TOC -->

- [Como contribuir](#como-contribuir)
  - [1. Prepare o ambiente](#1-prepare-o-ambiente)
  - [2. Fluxo de trabalho (SDD em modo agente)](#2-fluxo-de-trabalho-sdd-em-modo-agente)
  - [3. Regras de documentação](#3-regras-de-documentação)
  - [4. Comandos úteis](#4-comandos-úteis)
  - [5. Atualização de dependências](#5-atualização-de-dependências)

<!-- TOC -->

## 1. Prepare o ambiente

1. Veja [REQUIREMENTS.md](REQUIREMENTS.md) e rode `make check-os` e `make check-dependencies`.
2. `make install` (mise + Node.js + dependências, sem nada global).
3. `make up` e abra `http://localhost:8080`.

## 2. Fluxo de trabalho (SDD em modo agente)

1. Toda mudança parte do [PRD](docs/prd/PRD.md) e da pasta da feature em `docs/features/FXX-*/` (spec, plano, contrato).
2. Crie a branch `feat/FXX-<nome>` — para trabalho paralelo, em um worktree:

   ```bash
   git worktree add ../catraca-F04 -b feat/F04-vitrine
   cd ../catraca-F04
   COMPOSE_PROJECT_NAME=catraca-f04 APP_PORT=8084 OBSERVABILITY=0 make up
   ```

3. Faça um primeiro commit cedo e commits pequenos (mensagens no imperativo, em inglês: `feat(F04): add showcase page`).
4. Mantenha `make gates` verde. Testes unitários e de integração são obrigatórios para cada critério.
5. Abra o PR (`gh pr create`) descrevendo os critérios atendidos.
6. Peça a avaliação independente (subagente `evaluator`, contexto vazio). Relatório novo em `docs/features/FXX-*/reports/`.
7. Reprovado → corrija → nova avaliação (novo arquivo). Aprovado → atualize `state/project-state.json` → merge.

## 3. Regras de documentação

- pt-BR na documentação, en-US no código.
- TOC em todo `.md` entre duas tags `<!-- TOC -->`: rode `make toc`.
- Mudou arquitetura/fluxo/testes/classes? Atualize o diagrama Mermaid e a analogia em `docs/architecture/`.
- Variável nova → `.env.example` + [configuração](docs/operations/configuracao.md). Código de erro novo → [troubleshooting](docs/operations/troubleshooting.md).

## 4. Comandos úteis

| Comando | O que faz |
| --- | --- |
| `make help` | Lista todos os alvos |
| `make up` / `make down` | Sobe / derruba tudo |
| `make test-unit` / `make test-integration` | Sobe, testa, derruba e mostra o resumo |
| `make gates` | Todos os gates |
| `make logs SERVICE=app` | Logs de um serviço |
| `make evaluator-flow` | Fluxo do avaliador com `curl` |

## 5. Atualização de dependências

Só quando explicitamente solicitado, seguindo a seção "Atualização de dependências" do [CLAUDE.md](CLAUDE.md) (fontes oficiais, multi-arquitetura, matriz de SO e arquivos de requisitos).
