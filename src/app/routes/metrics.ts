// Prometheus /metrics endpoint (F09 fills this file).
import type { FastifyInstance } from 'fastify';

export async function registerMetrics(_app: FastifyInstance): Promise<void> {
  // F09: prom-client registry exposed at GET /metrics.
}
