// Entry point of the "migrate" compose service: wait for the DB, apply migrations, run the seed.
import { pool, waitForDatabase } from './pool.ts';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';
import { logger } from '../observability/logger.ts';

try {
  await waitForDatabase();
  const applied = await migrate();
  await seed();
  logger.info({ applied }, 'database ready (migrations + seed)');
  await pool.end();
} catch (err) {
  logger.error({ err }, (err as Error).message);
  process.exit(1);
}
