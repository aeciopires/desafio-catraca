// Applies src/db/migrations/NNN_*.sql in order, once each. Safe to run concurrently and repeatedly
// (advisory lock + schema_migrations table).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './pool.ts';
import { logger } from '../observability/logger.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
const LOCK_KEY = 74_201_001;

export async function migrate(): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `[ERRO][MIGRATION-001] Falha ao aplicar a migração ${file}: ${(err as Error).message}. ` +
            'Causa provável: SQL inválido ou migração já aplicada parcialmente. Como resolver: corrija a migração e rode make down && make clean && make up.',
          { cause: err },
        );
      }
      applied.push(file);
      logger.info({ migration: file }, 'migration applied');
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return applied;
}

if (import.meta.main) {
  migrate()
    .then((applied) => {
      logger.info({ applied }, 'migrations finished');
      return pool.end();
    })
    .catch((err) => {
      logger.error({ err }, String(err.message));
      process.exit(1);
    });
}
