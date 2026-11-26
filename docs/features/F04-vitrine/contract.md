# F04 — Vitrine e área do participante: contrato

<!-- TOC -->

- [F04 — Vitrine e área do participante: contrato](#f04--vitrine-e-área-do-participante-contrato)
  - [Pré-requisitos de ambiente](#pré-requisitos-de-ambiente)
  - [Itens verificáveis](#itens-verificáveis)
    - [C-F04-01 — Vitrine mostra só publicados](#c-f04-01--vitrine-mostra-só-publicados)
    - [C-F04-02 — Compra pela vitrine e "Meus ingressos"](#c-f04-02--compra-pela-vitrine-e-meus-ingressos)
    - [C-F04-03 — Esgotado na vitrine](#c-f04-03--esgotado-na-vitrine)
    - [C-F04-04 — Visitante e cartão inválido](#c-f04-04--visitante-e-cartão-inválido)
    - [C-F04-05 — Cross-feature F02 → F04](#c-f04-05--cross-feature-f02--f04)
    - [C-F04-06 — Cross-feature F03 → F04](#c-f04-06--cross-feature-f03--f04)
    - [C-F04-07 — Cross-feature F03 → F04 (vaga compartilhada entre canais)](#c-f04-07--cross-feature-f03--f04-vaga-compartilhada-entre-canais)
    - [C-F04-08 — Cross-feature F01 → F04](#c-f04-08--cross-feature-f01--f04)
  - [Mapeamento critério → itens](#mapeamento-critério--itens)

<!-- TOC -->

## Pré-requisitos de ambiente

- Stack no ar (`make up`) com worker; contas da seed; `WEB=http://localhost:${APP_PORT:-8080}`.

## Itens verificáveis

### C-F04-01 — Vitrine mostra só publicados

Organizador A cria evento (rascunho): `GET /` deslogado não contém o nome. Após publicar: contém, em `data-testid="showcase-event"`, com vagas = lotação.

### C-F04-02 — Compra pela vitrine e "Meus ingressos"

Participante novo (cadastro pela interface) compra com `4000000000000001`: `303 /me/tickets`; a linha mostra o nome do evento, `pendente` e um código de 8 caracteres; recarregando, em até 5 s (escala real) aparece `confirmado`.

### C-F04-03 — Esgotado na vitrine

Evento de lotação 1 com a vaga ocupada: `GET /events/{id}` mostra `Ingressos esgotados` e não mostra `purchase-form`; `POST /events/{id}/purchase` → `409` com `Ingressos esgotados`.

### C-F04-04 — Visitante e cartão inválido

Visitante: `POST /events/{id}/purchase` → `302 /login?next=...`. Participante com cartão `123` → `422` com `O número do cartão deve ter 16 dígitos` e nenhum ingresso novo em "Meus ingressos".

### C-F04-05 — Cross-feature F02 → F04

Rascunho criado pela F02 fica fora da vitrine e `GET /events/{id}` → `404`; publicado aparece (coberto em C-F04-01).

### C-F04-06 — Cross-feature F03 → F04

A compra da vitrine passa pelo núcleo da F03: ingresso no banco com `channel='web'`, `buyer_user_id` do participante e job de pagamento; confirmação via worker.

### C-F04-07 — Cross-feature F03 → F04 (vaga compartilhada entre canais)

Evento de lotação 1: compra com canal `partner` (cartão `…0002`) → vitrine mostra `Ingressos esgotados`; após a recusa do gateway, a vitrine volta a mostrar o formulário de compra.

### C-F04-08 — Cross-feature F01 → F04

Participante criado pelo cadastro da F01 vê o próprio ingresso e não vê ingressos de outro participante.

## Mapeamento critério → itens

| Critério | Itens |
| --- | --- |
| F04-AC01 | C-F04-01 |
| F04-AC02 | C-F04-02 |
| F04-AC03 | C-F04-03 |
| F04-AC04 | C-F04-04 |
| XF-F02-F04-01 | C-F04-05, C-F04-01 |
| XF-F03-F04-01 | C-F04-06, C-F04-02 |
| XF-F03-F04-02 | C-F04-07 |
| XF-F01-F04-01 | C-F04-08 |
