// Public showcase and participant area (F04 fills this file).
import type { FastifyInstance } from 'fastify';

export default async function showcaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    return reply.view('showcase/index-stub.ejs', { title: 'Vitrine' });
  });
}
