// Fastify application factory. Route modules are registered here once (F01) so that each
// feature only fills in its own file, avoiding merge conflicts between parallel waves.
import { join } from 'node:path';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import { config } from '../config.ts';
import { logger } from '../observability/logger.ts';
import { pool } from '../db/pool.ts';
import { registerAuth } from './auth.ts';
import { formatCents } from '../lib/money.ts';
import { formatDateTimeBR } from '../lib/time.ts';
import authRoutes from './routes/auth.ts';
import organizerRoutes from './routes/organizer.ts';
import showcaseRoutes from './routes/showcase.ts';
import partnerRoutes from './routes/partner.ts';
import { registerDocs } from './routes/docs.ts';
import { registerMetrics } from './routes/metrics.ts';

export const VIEWS_DIR = join(import.meta.dirname, 'views');

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    trustProxy: true,
  }) as unknown as FastifyInstance;

  await app.register(fastifyCookie, { secret: config.sessionSecret });
  await app.register(fastifyFormbody);
  await app.register(fastifyView, {
    engine: { ejs },
    root: VIEWS_DIR,
    defaultContext: { formatCents, formatDateTimeBR, title: 'Catraca' },
  });
  registerAuth(app);

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', error: 'DB_UNAVAILABLE' });
    }
  });

  // OpenAPI must be registered before the routes it documents (F05).
  await registerDocs(app);
  await registerMetrics(app);
  await app.register(authRoutes);
  await app.register(showcaseRoutes);
  await app.register(organizerRoutes);
  await app.register(partnerRoutes, { prefix: '/api/partner' });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
    return reply
      .code(404)
      .view('error.ejs', { title: 'Página não encontrada', message: 'Página não encontrada.' });
  });

  app.setErrorHandler((err, request, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err, code: 'UNHANDLED_ERROR' }, 'unhandled error');
    }
    if (request.url.startsWith('/api/')) {
      return reply.code(status).send({ error: status >= 500 ? 'internal_error' : 'bad_request' });
    }
    return reply.code(status).view('error.ejs', {
      title: status >= 500 ? 'Erro interno' : 'Requisição inválida',
      message:
        status >= 500
          ? 'Erro interno. Consulte os logs (make logs SERVICE=app).'
          : 'Requisição inválida.',
    });
  });

  return app;
}
