// PostgreSQL connection pool and transaction helper.
import pg from 'pg';
import { config } from '../config.ts';
import { logger } from '../observability/logger.ts';

// Return int8/bigint (e.g. count(*)) as JS numbers: values here are always small.
pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX ?? 20),
});

pool.on('error', (err) => {
  logger.error({ err, code: 'DB_POOL_ERROR' }, 'unexpected idle client error');
});

export type DbClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Runs `fn` inside BEGIN/COMMIT; rolls back on any thrown error. */
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Waits for the database to accept connections (used at startup), with a clear error. */
export async function waitForDatabase(timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(
    `[ERRO][DB-001] Banco inacessível após ${timeoutMs / 1000}s. Causa provável: serviço postgres parado ou DATABASE_URL incorreta. ` +
      `Como resolver: docker compose ps postgres && docker compose logs postgres. Último erro: ${String(lastError)}`,
  );
}
