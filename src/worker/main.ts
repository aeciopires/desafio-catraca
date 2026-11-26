// Worker entrypoint (service "worker"): polls due payment jobs and exposes /healthz and /metrics.
import { createServer } from 'node:http';
import { config } from '../config.ts';
import { pool, waitForDatabase } from '../db/pool.ts';
import { logger } from '../observability/logger.ts';
import { processDuePayments } from './payment-worker.ts';
import { addWorkerHttpHandler, extraHandlers } from './http.ts';
import { renderMetrics } from '../observability/metrics.ts';

addWorkerHttpHandler(async (path) =>
  path === '/metrics' ? { status: 200, ...(await renderMetrics()) } : null,
);

let running = true;
let lastTickOk = Date.now();

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path === '/healthz') {
    const healthy = Date.now() - lastTickOk < 30_000;
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: healthy ? 'ok' : 'stalled' }));
    return;
  }
  for (const handler of extraHandlers) {
    const out = await handler(path);
    if (out) {
      res.writeHead(out.status, { 'content-type': out.type });
      res.end(out.body);
      return;
    }
  }
  res.writeHead(404).end();
});

async function loop(): Promise<void> {
  while (running) {
    try {
      const processed = await processDuePayments();
      lastTickOk = Date.now();
      if (processed > 0) continue; // drain backlog without waiting
    } catch (err) {
      logger.error(
        { err, code: 'WORKER_TICK_FAILED' },
        '[ERRO][WORKER-001] falha ao processar pagamentos',
      );
    }
    await new Promise((r) => setTimeout(r, config.workerPollMs));
  }
}

try {
  await waitForDatabase();
  server.listen(config.metricsPort, '0.0.0.0');
  logger.info(
    { pollMs: config.workerPollMs, delayScale: config.gatewayDelayScale },
    'payment worker started',
  );
  const stop = async (signal: string) => {
    logger.info({ signal }, 'worker stopping');
    running = false;
    server.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
  await loop();
} catch (err) {
  logger.error({ err }, `[ERRO][WORKER-002] Worker não iniciou: ${(err as Error).message}`);
  process.exit(1);
}
