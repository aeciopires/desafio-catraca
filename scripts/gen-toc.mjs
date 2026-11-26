#!/usr/bin/env node
// Idempotent Table of Contents generator for Markdown files.
//
// - The TOC lives between two IDENTICAL marker lines: `<!-- TOC -->` ... `<!-- TOC -->`
//   (same convention used by Markdown editor plugins; `<!-- /TOC -->` is NOT used).
// - If the block exists, its content is replaced; otherwise it is inserted right after the first H1
//   (or at the top of the file when there is no H1). Running it twice produces no diff.
// - Headings inside fenced code blocks are ignored. Anchors follow GitHub's slug rules.
//
// Usage:
//   node scripts/gen-toc.mjs            # update every tracked .md file
//   node scripts/gen-toc.mjs --check    # exit 1 if any file would change
//   node scripts/gen-toc.mjs FILE...    # only the given files
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MARKER = '<!-- TOC -->';
const MAX_LEVEL = 3;
// Directories never touched. Evaluation reports are immutable after commit.
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'test-results', 'reports']);
const ROOT = process.cwd();

export function slugify(text, used) {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
  let slug = base;
  let n = 1;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function plainText(heading) {
  // Remove markdown emphasis/code/links for the anchor; keep the original text for the label.
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

export function buildToc(lines) {
  const used = new Set();
  const items = [];
  let inFence = false;
  let inToc = false;
  for (const line of lines) {
    if (line.trim() === MARKER) {
      inToc = !inToc;
      continue;
    }
    if (inToc) continue;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length;
    const label = m[2];
    const slug = slugify(plainText(label), used);
    if (level <= MAX_LEVEL) items.push(`${'  '.repeat(level - 1)}- [${label}](#${slug})`);
  }
  return items;
}

export function applyToc(content) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const toc = buildToc(lines);
  const block = [MARKER, '', ...toc, '', MARKER];
  const markerIdx = lines.map((l, i) => (l.trim() === MARKER ? i : -1)).filter((i) => i >= 0);
  if (markerIdx.length >= 2) {
    const [start, end] = markerIdx;
    lines.splice(start, end - start + 1, ...block);
  } else {
    // No (complete) block: insert after the first H1 outside code fences / front matter.
    let insertAt = 0;
    let inFence = false;
    let frontMatter = lines[0] === '---';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (frontMatter) {
        if (i > 0 && line === '---') {
          frontMatter = false;
          insertAt = i + 1;
        }
        continue;
      }
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (!inFence && /^#\s+/.test(line)) {
        insertAt = i + 1;
        break;
      }
    }
    if (markerIdx.length === 1) {
      lines.splice(markerIdx[0], 1); // drop dangling marker
      if (markerIdx[0] < insertAt) insertAt--;
    }
    const after = lines[insertAt] === '' ? [] : [''];
    lines.splice(insertAt, 0, '', ...block, ...after);
  }
  return lines.join(eol);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter((a) => !a.startsWith('--'));
  const targets = files.length ? files.map((f) => resolve(f)) : walk(ROOT);
  const changed = [];
  for (const file of targets) {
    const before = readFileSync(file, 'utf8');
    const after = applyToc(before);
    if (after !== before) {
      changed.push(relative(ROOT, file));
      if (!check) writeFileSync(file, after);
    }
  }
  if (check && changed.length) {
    console.error(`[ERRO][TOC-001] TOC desatualizado em ${changed.length} arquivo(s):`);
    for (const f of changed) console.error(`  - ${f}`);
    console.error('  Causa provável: o Markdown foi editado sem regenerar o sumário.');
    console.error('  Como resolver:  make toc   (ou: node scripts/gen-toc.mjs)');
    process.exit(1);
  }
  console.log(
    check
      ? `[OK] TOC atualizado em ${targets.length} arquivo(s)`
      : `[OK] TOC gerado/atualizado: ${changed.length} de ${targets.length} arquivo(s) alterados`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
