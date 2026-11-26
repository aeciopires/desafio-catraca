# F08 — Painel do evento: contrato

<!-- TOC -->

- [F08 — Painel do evento: contrato](#f08--painel-do-evento-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F08-01 — Seis números presentes](#c-f08-01--seis-números-presentes)
    - [C-F08-02 — Receita com preço vigente (passo 9)](#c-f08-02--receita-com-preço-vigente-passo-9)
    - [C-F08-03 — Check-ins (passo 10)](#c-f08-03--check-ins-passo-10)
    - [C-F08-04 — Pendentes e vagas](#c-f08-04--pendentes-e-vagas)
    - [C-F08-05 — Após cancelamento (passo 14)](#c-f08-05--após-cancelamento-passo-14)
    - [C-F08-06 — Rajada (passo 15)](#c-f08-06--rajada-passo-15)
    - [C-F08-07 — Dono](#c-f08-07--dono)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`) com worker; organizadores A e B; `API`/`KEY`.

## Itens verificáveis

### C-F08-01 — Seis números presentes

A página de gestão do dono mostra `dash-confirmed`, `dash-pending`, `dash-checkins`, `dash-available`, `dash-revenue`, `dash-refunded` com os rótulos de R12.

### C-F08-02 — Receita com preço vigente (passo 9)

E1 (lotação 2, R$ 100,00): 2 confirmados (vitrine + API); muda preço para R$ 150,00 e lotação para 3; 1 compra confirmada → Confirmados 3, Pendentes 0, Check-ins 0, Vagas 0, Receita `R$ 350,00`, Estornados 0.

### C-F08-03 — Check-ins (passo 10)

Após `Entrada liberada` de um código: Check-ins 1 e Confirmados continua 3.

### C-F08-04 — Pendentes e vagas

Compra com `…0003` → Pendentes 1 e Vagas diminui 1; recusa (`…0002`) → depois da resposta, Pendentes 0 e a vaga volta.

### C-F08-05 — Após cancelamento (passo 14)

E3 com 1 confirmado e 1 pendente, cancelado → Confirmados 0, Pendentes 0, Check-ins 0, Vagas 0, Receita `R$ 0,00`, Estornados 1.

### C-F08-06 — Rajada (passo 15)

E4 lotação 5 após 30 compras concorrentes com `…0001` → em ≤ 10 s Confirmados 5 e Vagas 0.

### C-F08-07 — Dono

Organizador B não vê o painel de E1 (`404`, sem `dash-*` no HTML).

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F08-AC01 | C-F08-01 |
| F08-AC02 | C-F08-02 |
| F08-AC03 | C-F08-04, C-F08-05, C-F08-06 |
| F08-AC04 | C-F08-07 |
| XF-F02-F08-01 | C-F08-01, C-F08-07 |
| XF-F03-F08-01 | C-F08-02, C-F08-06 |
| XF-F06-F08-01 | C-F08-03 |
| XF-F07-F08-01 | C-F08-05 |
