# Testes

<!-- TOC -->

- [Testes](#testes)
  - [Analogia: o ensaio geral](#analogia-o-ensaio-geral)
  - [Pirâmide](#pirâmide)
  - [Como rodar](#como-rodar)

<!-- TOC -->

## Analogia: o ensaio geral

Antes da estreia a banda ensaia cada música sozinha (testes **unitários**: funções puras, sem banco), depois ensaia o show inteiro no palco de verdade (testes de **integração**: app, worker e banco rodando em contêineres) e, por fim, faz a passagem de som com o público imaginário seguindo o roteiro oficial (**fluxo do avaliador** com `curl`).

## Pirâmide

```mermaid
flowchart TB
    F["Fluxo do avaliador<br/>scripts/evaluator-flow.sh (curl, escala real)"]
    I["Integração<br/>tests/integration/*.test.ts (HTTP + banco, escala 0.1)"]
    U["Unitários<br/>tests/unit/*.test.ts (funções puras)"]
    F --> I --> U
```

## Como rodar

```mermaid
sequenceDiagram
    participant M as make test-integration
    participant U as scripts/up.sh
    participant T as contêiner tools
    participant D as scripts/down.sh
    M->>U: sobe o stack (GATEWAY_DELAY_SCALE=0.1)
    M->>T: npm run test:integration
    T-->>M: resultado
    M->>D: derruba tudo (sempre, mesmo com falha)
    M-->>M: imprime o resumo
```

| Comando | O que roda |
| --- | --- |
| `make test-unit` | up → unitários → down |
| `make test-integration` | up → integração → down |
| `make test` | up → lint, typecheck, unitários, integração → down |
| `make gates` | spec, relatórios, TOC + `make test` |
| `make evaluator-flow` | Fluxo do avaliador contra o stack já no ar (`FAST=1` encurta o passo 8) |

Os testes rodam **dentro de um contêiner** (`tools`), então o host não precisa de Node para testar. A escala `0.1` do gateway só existe nos testes; o modo padrão do produto usa os tempos do brief.
