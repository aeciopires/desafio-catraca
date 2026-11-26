#!/usr/bin/env node
// Validates the specification artifacts against the requirements of TASK.md:
//  1. PRD has >= 5 features with ID, Provides/Consumes, dependency graph, waves (one with >= 2
//     features) and an out-of-scope section.
//  2. Every graph edge has at least one cross-feature criterion (XF-<from>-<to>-NN).
//  3. Every rule R01..R13 is cited by at least one criterion.
//  4. Every feature folder has spec.md, plan.md and contract.md; each contract maps every
//     criterion of its feature; each XF criterion is mapped by at least one contract.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PRD = join(ROOT, 'docs/prd/PRD.md');
const FEATURES_DIR = join(ROOT, 'docs/features');
const errors = [];
const fail = (code, msg, fix) => errors.push({ code, msg, fix });

if (!existsSync(PRD)) {
  console.error('[ERRO][SPEC-000] docs/prd/PRD.md não encontrado');
  process.exit(1);
}
const prd = readFileSync(PRD, 'utf8');

// --- features ---
const featureIds = [...prd.matchAll(/^### (F\d{2}) — /gm)].map((m) => m[1]);
if (featureIds.length < 5) fail('SPEC-001', `PRD tem ${featureIds.length} features (mínimo 5)`, 'Adicione features em "## 4. Features".');
for (const id of featureIds) {
  const section = prd.split(new RegExp(`^### ${id} — `, 'm'))[1]?.split(/^### /m)[0] ?? '';
  if (!/\*\*Provides\*\*/.test(section) || !/\*\*Consumes\*\*/.test(section)) {
    fail('SPEC-002', `${id} sem Provides/Consumes`, `Declare **Provides** e **Consumes** em ${id}.`);
  }
}

// --- graph and waves ---
const edges = [...prd.matchAll(/^\s*(F\d{2})(?:\[[^\]]*\])?\s*-->\s*(F\d{2})/gm)].map((m) => [m[1], m[2]]);
if (!edges.length) fail('SPEC-003', 'Grafo de dependências (mermaid) sem arestas', 'Inclua o flowchart com FXX --> FYY.');
const waveRows = [...prd.matchAll(/^\|\s*W\d+\s*\|([^|]+)\|/gm)].map((m) => m[1].match(/F\d{2}/g) ?? []);
if (!waveRows.length) fail('SPEC-004', 'Tabela de waves não encontrada', 'Inclua a seção "## 6. Waves".');
if (!waveRows.some((w) => w.length >= 2)) fail('SPEC-005', 'Nenhuma wave com 2+ features', 'Uma wave deve ter duas ou mais features.');
if (!/^## .*Fora de escopo/m.test(prd)) fail('SPEC-006', 'Seção "Fora de escopo" ausente', 'Adicione "## Fora de escopo".');

// --- criteria ---
const criteria = [...prd.matchAll(/^- \*\*((?:F\d{2}-AC\d{2})|(?:XF-F\d{2}-F\d{2}-\d{2}))\*\* \(([^)]*)\)/gm)].map((m) => ({
  id: m[1],
  rules: m[2],
}));
const xf = criteria.filter((c) => c.id.startsWith('XF-'));
for (const [from, to] of edges) {
  if (!xf.some((c) => c.id.startsWith(`XF-${from}-${to}-`))) {
    fail('SPEC-007', `Aresta ${from} → ${to} sem critério cross-feature`, `Adicione XF-${from}-${to}-01 no PRD.`);
  }
}
for (let n = 1; n <= 13; n++) {
  const r = `R${String(n).padStart(2, '0')}`;
  if (!criteria.some((c) => c.rules.includes(r))) fail('SPEC-008', `Regra ${r} não citada em nenhum critério`, `Cite ${r} em um critério do PRD.`);
}

// --- feature folders ---
const folders = existsSync(FEATURES_DIR) ? readdirSync(FEATURES_DIR).filter((d) => /^F\d{2}-/.test(d)) : [];
const contracts = {};
for (const id of featureIds) {
  const folder = folders.find((d) => d.startsWith(`${id}-`));
  if (!folder) {
    fail('SPEC-009', `Pasta da feature ${id} não encontrada em docs/features`, `Crie docs/features/${id}-<nome>/.`);
    continue;
  }
  for (const f of ['spec.md', 'plan.md', 'contract.md']) {
    if (!existsSync(join(FEATURES_DIR, folder, f))) fail('SPEC-010', `${folder}/${f} ausente`, `Crie ${folder}/${f}.`);
  }
  const cpath = join(FEATURES_DIR, folder, 'contract.md');
  contracts[id] = existsSync(cpath) ? readFileSync(cpath, 'utf8') : '';
}
// Mapping table rows look like: | F02-AC01 | C-F02-01, C-F02-02 |
const mapped = (text, cid) => new RegExp(`^\\|\\s*${cid}\\s*\\|\\s*C-F\\d{2}-\\d{2}`, 'm').test(text);
for (const c of criteria.filter((x) => !x.id.startsWith('XF-'))) {
  const fid = c.id.slice(0, 3);
  if (contracts[fid] !== undefined && !mapped(contracts[fid], c.id)) {
    fail('SPEC-011', `${c.id} não mapeado no contrato de ${fid}`, `Adicione a linha "| ${c.id} | C-${fid}-NN |" no contract.md.`);
  }
}
for (const c of xf) {
  if (!Object.values(contracts).some((t) => mapped(t, c.id))) {
    fail('SPEC-012', `${c.id} não mapeado em nenhum contrato`, 'Mapeie o critério no contract.md de uma das features envolvidas.');
  }
}

if (errors.length) {
  for (const e of errors) {
    console.error(`[ERRO][${e.code}] ${e.msg}\n  Como resolver:  ${e.fix}`);
  }
  console.error(`  Detalhes:       ${errors.length} problema(s) em docs/prd/PRD.md / docs/features`);
  process.exit(1);
}
console.log(
  `[OK] Spec consistente: ${featureIds.length} features, ${edges.length} arestas, ${criteria.length} critérios (${xf.length} cross-feature), R01–R13 cobertas`,
);
