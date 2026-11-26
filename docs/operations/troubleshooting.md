# Troubleshooting: códigos de erro

<!-- TOC -->

- [Troubleshooting: códigos de erro](#troubleshooting-códigos-de-erro)
  - [Formato das mensagens](#formato-das-mensagens)
  - [Catálogo](#catálogo)
  - [Problemas frequentes](#problemas-frequentes)

<!-- TOC -->

## Formato das mensagens

Todo erro do Makefile, dos scripts, do app, do worker e dos agentes segue o mesmo formato, para que a causa raiz apareça na primeira leitura:

```text
[ERRO][<CÓDIGO>] <o que falhou>
  Causa provável: <diagnóstico>
  Como resolver:  <ação concreta>
  Detalhes:       <comando/log para investigar>
```

> Analogia: é como o painel de um carro que, em vez de só acender uma luz vermelha, diz "pneu dianteiro esquerdo com pouca pressão — calibre para 32 psi".

## Catálogo

| Código | Onde | Significado | Primeiro passo |
| --- | --- | --- | --- |
| `OS-001` | `check-os.sh` | SO/arquitetura fora da matriz | Ver [REQUIREMENTS.md](../../REQUIREMENTS.md) ou `ALLOW_UNSUPPORTED_OS=1` |
| `DEP-001` | `check-deps.sh` | Docker CLI ausente | Instalar pelo link oficial exibido |
| `DEP-002` | `check-deps.sh` | Docker daemon inacessível | `sudo systemctl start docker` / `colima start` |
| `DEP-003` | `check-deps.sh` | Compose v2 ausente | Instalar o plugin `docker compose` |
| `DEP-004` | `check-deps.sh` | git/make ausente | Gerenciador de pacotes do SO |
| `PORT-001` | `check-ports.sh` | Porta ocupada | Trocar a variável indicada (`APP_PORT=...`) |
| `PORT-002` | `check-ports.sh` | Duas variáveis com a mesma porta | Usar portas diferentes |
| `UP-001` | `up.sh` | Build falhou | Ver saída do build; `docker compose build --no-cache` |
| `UP-002` | `up.sh` | Serviço não ficou saudável | Logs exibidos; `make logs SERVICE=<svc>` |
| `UP-003` | `up.sh` | App saudável mas porta inacessível no host | Firewall/porta; `make logs SERVICE=app` |
| `DOWN-001`/`DOWN-002` | `down.sh` | Falha ao derrubar / contêiner remanescente | `docker rm -f <id>` |
| `TEST-001..004` | `run-tests.sh` | Subida para testes, build da imagem de testes, suíte desconhecida, testes falhando | Ver saída do Vitest; `KEEP_UP=1` para depurar |
| `GATE-001..003` | `gates.sh` | Algum gate falhou / Node ausente no host | Ver a etapa indicada |
| `TOC-001` | `gen-toc.mjs` | TOC desatualizado | `make toc` |
| `SPEC-000..012` | `check-spec.mjs` | PRD/contratos inconsistentes | Seguir o "Como resolver" exibido |
| `REPORT-001..003` | `check-reports.sh` | Relatório incompleto ou alterado após commit | Gerar relatório **novo** |
| `STATE-001..006` | `check-reports.sh` | Arquivo de estado ausente/inválido/inconsistente | Corrigir `state/project-state.json` |
| `INSTALL-001..003` | `install.sh` | Falha ao instalar mise/ferramentas/npm | Instalação manual (link exibido) |
| `CFG-001`/`CFG-002` | app/worker | Variável de ambiente inválida / modo de gateway não suportado | Corrigir a variável |
| `DB-001` | app/worker/migrate | Banco inacessível | `make ps`, `make logs SERVICE=postgres` |
| `MIGRATION-001` | migrate | Migração falhou | Corrigir SQL; `make clean && make up` |
| `SEED-001` | migrate | Seed falhou | `make logs SERVICE=migrate` |
| `APP-001`/`APP-002` | app | Porta interna em uso / falha de inicialização | `make logs SERVICE=app` |
| `WORKER-001`/`WORKER-002` | worker | Falha em um ciclo / worker não iniciou | `make logs SERVICE=worker` |
| `FLOW-*` | `evaluator-flow.sh` | Passo do Fluxo do avaliador divergiu | Ver o passo e a resposta exibidos |

## Problemas frequentes

- **`make up` parado em "Waiting"**: o healthcheck não passou; a saída de `UP-002` mostra os logs do serviço. Com observabilidade ligada, a primeira subida baixa imagens grandes — use `UP_TIMEOUT=600` em redes lentas.
- **Login não funciona após trocar `SESSION_SECRET`**: cookies antigos ficam inválidos; entre de novo.
- **Testes falham por tempo**: confirme que `GATEWAY_DELAY_SCALE` dos testes é `0.1` (`make test-*` já faz isso).
