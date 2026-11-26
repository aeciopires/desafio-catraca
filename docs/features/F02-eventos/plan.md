# F02 — Gestão de eventos: plano

<!-- TOC -->

- [F02 — Gestão de eventos: plano](#f02--gestão-de-eventos-plano)
  - [Etapas](#etapas)

<!-- TOC -->

## Etapas

1. Primeiro commit cedo: esqueleto de `src/domain/events.ts`, `src/app/manage-sections.ts` e *stubs* de `src/app/sections/*` (garante a intercalação de commits da wave paralela).
2. Domínio: validação (R01), criar, editar com lock e checagem de vagas ocupadas (R03), publicar (R02), bloqueio de cancelado, isolamento por organizador (R13), `listPublishedEvents`/`getPublishedEvent`.
3. Rotas e views: lista, novo, página de gestão, edição, publicação, 404 genérico.
4. Testes unitários de `validateEventInput` (datas, lotação, preço, vírgula decimal).
5. Testes de integração `tests/integration/events.test.ts`: criar rascunho, data passada, editar lotação abaixo/acima, publicar, isolamento A/B, edição de cancelado (forçando status via SQL, já que o cancelamento é da F07).
6. `make gates` verde; atualizar `state/project-state.json` para `in_review`.
