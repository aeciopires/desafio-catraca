// Organizer area (F02 fills this file). F01 ships a minimal "Meus eventos" page so the
// organizer guard (R13) can be verified end to end.
import type { FastifyInstance } from 'fastify';
import { requireOrganizer } from '../auth.ts';

export default async function organizerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organizer/events', { preHandler: requireOrganizer }, async (_request, reply) => {
    return reply.view('organizer/list-stub.ejs', { title: 'Meus eventos' });
  });
  app.get('/organizer/events/new', { preHandler: requireOrganizer }, async (_request, reply) => {
    return reply.view('organizer/list-stub.ejs', { title: 'Novo evento' });
  });
}
