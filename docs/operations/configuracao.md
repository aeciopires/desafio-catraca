# Configuração: variáveis de ambiente e portas

<!-- TOC -->

- [Configuração: variáveis de ambiente e portas](#configuração-variáveis-de-ambiente-e-portas)
  - [Como funciona](#como-funciona)
  - [Portas](#portas)
  - [Comportamento](#comportamento)
  - [Exemplos](#exemplos)

<!-- TOC -->

## Como funciona

Todas as variáveis têm valor padrão: `make up` funciona sem nenhum arquivo `.env`. Para mudar algo, exporte a variável na linha de comando (`APP_PORT=8081 make up`) ou copie [.env.example](../../.env.example) para `.env` e edite (o Compose lê o `.env` da raiz; o `.env` não é versionado).

> Analogia: as variáveis são os "botões do painel" do prédio. O prédio funciona com a configuração de fábrica; você só mexe num botão quando precisa (ex.: a porta 8080 já está ocupada por outro inquilino).

## Portas

| Variável | Padrão | Serviço | Quando mudar |
| --- | --- | --- | --- |
| `APP_PORT` | `8080` | Produto (`$WEB`) e API de parceiros (`$API`) | Porta ocupada por outro app |
| `GRAFANA_PORT` | `3000` | Grafana | Conflito com apps Node/React locais |
| `PROMETHEUS_PORT` | `9090` | Prometheus | Outro Prometheus local |
| `JAEGER_UI_PORT` | `16686` | Jaeger UI | Outro Jaeger local |
| `LOKI_PORT` | `3100` | Loki | Outro Loki local |

O Postgres e o OpenTelemetry Collector não publicam portas no host (acesso via `make psql`). Antes de subir, `scripts/check-ports.sh` verifica todas as portas e, se alguma estiver ocupada, para com:

```text
[ERRO][PORT-001] Porta 8080 (APP_PORT) já está em uso por python3 (pid 1234)
  Causa provável: Outro processo ou container está escutando nessa porta.
  Como resolver:  Libere a porta ou escolha outra: export APP_PORT=<porta livre> && make up
  Detalhes:       ss -ltnp 'sport = :8080'  (ou: lsof -nP -iTCP:8080 -sTCP:LISTEN)
```

## Comportamento

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `catraca` | Isola contêineres, volume e imagem; use um nome por worktree para rodar ambientes em paralelo |
| `OBSERVABILITY` | `1` | `1` sobe Prometheus, Grafana, Jaeger, Loki e Collector; `0` sobe só o produto |
| `GATEWAY_MODE` | `simulated` | Único modo do MVP (sem chaves reais) |
| `GATEWAY_DELAY_SCALE` | `1` | Multiplica os atrasos do gateway simulado. **Mantenha 1 na avaliação**; os testes usam `0.1` |
| `TEST_GATEWAY_DELAY_SCALE` | `0.1` | Escala usada por `make test-*` |
| `WORKER_POLL_MS` | `200` | Intervalo de busca de decisões do gateway pelo worker |
| `LOG_LEVEL` | `info` | Nível de log (pino) |
| `PARTNER_API_KEY` | `catraca-partner-key-dev` | Chave de parceiro criada pela seed |
| `SESSION_SECRET` | valor de desenvolvimento | Assina o cookie de sessão |
| `UP_TIMEOUT` | `180` | Segundos de espera pelos healthchecks no `make up` |
| `ALLOW_UNSUPPORTED_OS` | `0` | `1` permite rodar fora da matriz de SO suportada |
| `KEEP_UP` | `0` | `1` mantém o ambiente no ar após `make test-*` (depuração) |

## Exemplos

```bash
APP_PORT=8081 GRAFANA_PORT=3001 make up          # portas alternativas
OBSERVABILITY=0 make up                          # só o produto (mais leve)
COMPOSE_PROJECT_NAME=catraca-f04 APP_PORT=8084 OBSERVABILITY=0 make up   # ambiente paralelo (worktree)
```

Use as mesmas variáveis no `make down` correspondente (ex.: `COMPOSE_PROJECT_NAME=catraca-f04 make down`).
