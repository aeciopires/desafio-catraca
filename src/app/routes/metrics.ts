// Prometheus /metrics endpoint and HTTP request duration histogram (F09).
import type { FastifyInstance } from 'fastify';
import { httpDuration, renderMetrics } from '../../observability/metrics.ts';

export async function registerMetrics(app: FastifyInstance): Promise<void> {
  // Root-level hook: applies to every route registered afterwards (including plugins).
  app.addHook('onResponse', async (request, reply) => {
    httpDuration.observe(
      {
        method: request.method,
        // Route template (e.g. /api/partner/tickets/:ticketId) keeps label cardinality low.
        route: request.routeOptions.url ?? 'unmatched',
        status_code: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });

  app.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    const { type, body } = await renderMetrics();
    return reply.type(type).send(body);
  });
}
