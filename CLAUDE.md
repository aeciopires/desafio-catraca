# CLAUDE.md

<!-- TOC -->

- [CLAUDE.md](#claudemd)
  - [Guardrails](#guardrails)
  - [Atualização de dependências (somente quando explicitamente solicitado)](#atualização-de-dependências-somente-quando-explicitamente-solicitado)

<!-- TOC -->

**Leia e siga o [AGENTS.md](AGENTS.md)** — ele é a porta de entrada com comandos, regras e o mapa dos artefatos. Este arquivo acrescenta os guardrails de manutenção para manter o repositório consistente com o [TASK.md](TASK.md).

## Guardrails

1. **Fonte da verdade**: `TASK.md` → `docs/prd/PRD.md` → spec/contrato da feature. Toda mudança de comportamento precisa de: regra R01–R13 rastreada, critério no PRD, item no contrato e teste. Rode `make check-spec`. Nunca altere o contrato fixo da API de parceiros.
2. **Idiomas**: documentação em pt-BR; código, identificadores e comentários em en-US.
3. **TOC**: todo arquivo `.md` tem sumário no início, entre **duas tags idênticas** `<!-- TOC -->` (não use `<!-- /TOC -->`, que conflita com plugins de Markdown). Após editar Markdown, rode `make toc`; `make toc-check` faz parte dos gates. O script é idempotente.
4. **Diagramas e analogias**: ao mudar arquitetura, fluxo da API, fluxo dos agentes, testes, classes/módulos ou observabilidade, atualize o diagrama Mermaid **e** a analogia correspondentes em `docs/architecture/` (e `docs/operations/observabilidade.md`). A documentação é escrita para iniciantes.
5. **Relatórios imutáveis**: nunca edite arquivos em `docs/features/*/reports/`. Reavaliação gera arquivo novo. Quem implementou não avalia (use o subagente `evaluator` com contexto vazio). `make check-reports` verifica.
6. **Estado**: atualize `state/project-state.json` sempre que o status de uma feature mudar; `latestReport` aponta para o relatório mais recente.
7. **Erros com causa raiz**: mensagens no padrão `[ERRO][CÓDIGO]` + "Causa provável" + "Como resolver" (+ "Detalhes"). Código novo vai para `docs/operations/troubleshooting.md`.
8. **Portas e variáveis**: toda variável nova vai para `.env.example`, `docs/operations/configuracao.md` e README. Portas sempre configuráveis por variável e checadas por `scripts/check-ports.sh`.
9. **Sistemas suportados**: Ubuntu 22.04/24.04/26.04 (amd64) e macOS (amd64/arm64) com **Colima** (não Docker Desktop). A matriz vive em `scripts/check-os.sh`, `REQUIREMENTS.md` e `docs/requirements/`. Imagens precisam ter manifest `linux/amd64` e `linux/arm64`.
10. **Sem segredos reais**: o modo padrão usa o gateway simulado; nunca commite `.env`.
11. **Antes de declarar pronto**: `make gates` verde e, para entregas, o Fluxo do avaliador completo a partir de um clone limpo da `main`.

## Atualização de dependências (somente quando explicitamente solicitado)

Não atualize versões por iniciativa própria. Quando alguém pedir explicitamente para atualizar os softwares:

1. Consulte **fontes oficiais**: <https://nodejs.org/en/about/previous-releases> (Node LTS), <https://www.postgresql.org/support/versioning/>, Docker Hub oficial de cada imagem, <https://docs.docker.com/engine/install/ubuntu/>, <https://docs.docker.com/compose/install/linux/>, <https://github.com/abiosoft/colima/releases>, <https://mise.jdx.dev/getting-started.html>, releases do Grafana, Prometheus, Jaeger, Loki e OpenTelemetry Collector, e `npm view <pacote> version`.
2. Atualize: `.mise.toml`, `package.json` + `package-lock.json` (`npm install`), tags no `docker-compose.yml` e `docker/app.Dockerfile`, a tabela de imagens em `docs/operations/imagens.md`.
3. Verifique multi-arquitetura de cada imagem: `docker buildx imagetools inspect <imagem:tag>` deve listar `linux/amd64` e `linux/arm64`.
4. Revise a matriz de SO em `scripts/check-os.sh` (ex.: nova LTS do Ubuntu, suporte do Docker Engine a ela).
5. Atualize os arquivos de requisitos: `REQUIREMENTS.md`, `docs/requirements/ubuntu.md` e `docs/requirements/macos.md` (versões mínimas e links oficiais de instalação), além de `CONTRIBUTING.md` se o fluxo mudar.
6. Rode `make gates` e `make evaluator-flow`; registre o resultado no PR.
