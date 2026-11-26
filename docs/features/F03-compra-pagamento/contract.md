# F03 — Núcleo de compra e pagamento: contrato

<!-- TOC -->

- [F03 — Núcleo de compra e pagamento: contrato](#f03--núcleo-de-compra-e-pagamento-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F03-01 — Compra cria pendente com código e responde sem esperar](#c-f03-01--compra-cria-pendente-com-código-e-responde-sem-esperar)
    - [C-F03-02 — Esgotado e concorrência](#c-f03-02--esgotado-e-concorrência)
    - [C-F03-03 — Tabela do gateway](#c-f03-03--tabela-do-gateway)
    - [C-F03-04 — Vaga ocupada e liberada](#c-f03-04--vaga-ocupada-e-liberada)
    - [C-F03-05 — Preço congelado](#c-f03-05--preço-congelado)
    - [C-F03-06 — Worker só altera pendente](#c-f03-06--worker-só-altera-pendente)
    - [C-F03-07 — Cartão inválido e não persistência do número](#c-f03-07--cartão-inválido-e-não-persistência-do-número)
    - [C-F03-08 — Cross-feature com F01](#c-f03-08--cross-feature-com-f01)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`), serviço `worker` em execução.
- Testes rodam no serviço `tools` com `make test-integration` (usa `GATEWAY_DELAY_SCALE=0.1`); a verificação em escala real usa `make up` padrão.

## Itens verificáveis

### C-F03-01 — Compra cria pendente com código e responde sem esperar

`purchaseTicket` em evento publicado retorna em < 1 s um ingresso `pending`, `code` casando `^[A-Z2-9]{8}$`, `channel` correto. Teste `tests/integration/purchase.test.ts`.

### C-F03-02 — Esgotado e concorrência

Evento com lotação 1 e 1 pendente → `DomainError('sold_out')`. Teste de concorrência: 20 eventos novos de lotação 5, 30 compras simultâneas cada → exatamente 5 ingressos e 25 `sold_out` em todos; 200 concorrentes em lotação 37 → 37 ingressos.

### C-F03-03 — Tabela do gateway

`tests/unit/simulated-gateway.test.ts`: finais 0001/0002/0003/0004/outro → decisão e faixa de atraso corretas; escala aplicada. Em escala real: compra com `0001` fica `confirmed` em ≤ 5 s (`waitFor` com timeout 5 s).

### C-F03-04 — Vaga ocupada e liberada

Evento lotação 1: compra com `0002` (pendente) → nova compra `sold_out`; após a recusa (`declined`), nova compra é aceita.

### C-F03-05 — Preço congelado

Compra com preço 10000, `UPDATE events SET price_cents=15000`, nova compra → ingressos com `price_cents` 10000 e 15000.

### C-F03-06 — Worker só altera pendente

Ingresso pendente com job agendado; `UPDATE tickets SET status='cancelled'`; após o vencimento do job o ingresso continua `cancelled` e o job fica `done` (ou `obsolete`).

### C-F03-07 — Cartão inválido e não persistência do número

`cardNumber` `123`, `40000000000000011`, `abcd...` → `invalid_card` e `SELECT count(*) FROM tickets` inalterado; colunas de `tickets`/`payment_jobs` só guardam `card_last4`.

### C-F03-08 — Cross-feature com F01

`countOccupiedSeats` (F01) reflete os ingressos criados pela F03 (`pending` + `confirmed`, ignora `declined`); `docker compose -p catraca ps worker` mostra o worker rodando e processando (log `payment processed`).

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F03-AC01 | C-F03-01 |
| F03-AC02 | C-F03-02 |
| F03-AC03 | C-F03-03 |
| F03-AC04 | C-F03-04 |
| F03-AC05 | C-F03-05 |
| F03-AC06 | C-F03-06 |
| F03-AC07 | C-F03-07 |
| XF-F01-F03-01 | C-F03-08 |
