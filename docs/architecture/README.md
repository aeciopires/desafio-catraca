# Arquitetura da Catraca (para iniciantes)

<!-- TOC -->

- [Arquitetura da Catraca (para iniciantes)](#arquitetura-da-catraca-para-iniciantes)

<!-- TOC -->

Cada página explica uma parte do sistema com **um diagrama Mermaid** e **uma analogia** do mundo real. Leia na ordem se você está chegando agora.

| # | Página | O que explica | Analogia |
| --- | --- | --- | --- |
| 1 | [Visão geral](visao-geral.md) | Contêineres e como conversam | Uma casa de shows |
| 2 | [Fluxo de compra](fluxo-compra.md) | Compra → gateway → worker | Comanda de restaurante |
| 3 | [Concorrência (R07)](concorrencia.md) | Por que nunca vendemos 112 lugares num show de 100 | Catraca física |
| 4 | [Estados do ingresso](estados-ingresso.md) | `pending`, `confirmed`, `declined`, `cancelled`, `refunded` | Etiqueta de bagagem |
| 5 | [API de parceiros](api-parceiros.md) | Rotas, autenticação e ordem dos erros | Porteiro que confere o crachá |
| 6 | [Check-in (R10)](checkin.md) | A lista ordenada de mensagens | Segurança na porta |
| 7 | [Cancelamento (R11)](cancelamento.md) | O que acontece com cada ingresso | Show cancelado |
| 8 | [Módulos e classes](classes.md) | Quem chama quem no código | Departamentos de uma empresa |
| 9 | [Testes](testes.md) | Pirâmide de testes e comandos | Ensaio geral |
| 10 | [Agentes e waves](agentes.md) | Como o projeto foi construído por agentes | Cozinheiro e crítico |
| 11 | [Observabilidade](../operations/observabilidade.md) | Métricas, traces e logs | Painel do carro |
