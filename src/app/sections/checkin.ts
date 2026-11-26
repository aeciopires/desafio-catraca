// Management-page section "checkin" (F06, R10/R13): code form + result, and its POST route.
import type { FastifyInstance } from 'fastify';
import { renderManagePage, type ManageSection } from '../manage-sections.ts';
import { findOwnedEvent } from '../../domain/events.ts';
import { checkIn } from '../../domain/checkin.ts';

type IdParams = { id: string };
type Body = Record<string, unknown>;

export const section: ManageSection | null = {
  id: 'checkin',
  order: 20,
  view: 'sections/checkin.ejs',
  // The form is always shown, including for cancelled events (R10: the list applies).
  async load() {
    return {};
  },
  register(app: FastifyInstance) {
    // Registered inside the organizer plugin: already behind requireOrganizer.
    app.post<{ Params: IdParams; Body: Body }>(
      '/organizer/events/:id/checkin',
      async (request, reply) => {
        const event = await findOwnedEvent(request.user!.id, request.params.id);
        if (!event) {
          // Same generic 404 page as the organizer routes: reveals nothing about the event.
          return reply
            .code(404)
            .view('error.ejs', {
              title: 'Evento não encontrado',
              message: 'Evento não encontrado.',
            });
        }
        const rawCode = typeof request.body?.code === 'string' ? request.body.code : '';
        const checkinResult = await checkIn(event.id, rawCode);
        return renderManagePage(reply, event, { checkinResult });
      },
    );
  },
};
