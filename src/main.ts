// HTTP entrypoint (service "app").
import { buildApp } from './app/server.ts';
import { config } from './config.ts';
import { pool, waitForDatabase } from './db/pool.ts';
import { logger } from './observability/logger.ts';

try {
  await waitForDatabase();
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'EADDRINUSE') {
    logger.error(
      `[ERRO][APP-001] Porta ${config.port} em uso dentro do contêiner. Causa provável: outro processo no mesmo contêiner. Como resolver: ajuste PORT.`,
    );
  } else {
    logger.error({ err }, `[ERRO][APP-002] Falha ao iniciar o app: ${e.message}`);
  }
  process.exit(1);
}
