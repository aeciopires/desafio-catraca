// Public showcase and participant area (F04): showcase, event page with purchase, "Meus ingressos".
import type { FastifyInstance } from 'fastify';
import { listPublishedEvents } from '../../domain/events.ts';

export default async function showcaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    const events = await listPublishedEvents();
    return reply.view('showcase/index.ejs', { title: 'Vitrine', events });
  });
}
