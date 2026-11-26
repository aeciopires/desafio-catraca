// Management-page section "cancellation" (F07, R11, R13): the irreversible "cancel event" action
// for a published event and the cancelled notice. The rule itself lives in domain/cancellation.ts.
import type { FastifyReply } from 'fastify';
import { renderManagePage, type ManageSection } from '../manage-sections.ts';
import { cancelEvent } from '../../domain/cancellation.ts';
import { findOwnedEvent } from '../../domain/events.ts';
import { isDomainError } from '../../lib/errors.ts';

/** Generic 404 that reveals nothing about the event (missing or owned by someone else). */
function eventNotFound(reply: FastifyReply): FastifyReply {
  return reply
    .code(404)
    .view('error.ejs', { title: 'Evento não encontrado', message: 'Evento não encontrado.' });
}

export const section: ManageSection | null = {
  id: 'cancellation',
  order: 90,
  view: 'sections/cancellation.ejs',
  async load({ event }) {
    return { cancelledAt: event.cancelled_at };
  },
  register(app) {
    app.post<{ Params: { id: string } }>('/organizer/events/:id/cancel', async (request, reply) => {
      const organizerId = request.user!.id;
      const { id } = request.params;
      try {
        await cancelEvent(organizerId, id);
        return reply.redirect(`/organizer/events/${encodeURIComponent(id)}?ok=cancelled`, 303);
      } catch (err) {
        if (isDomainError(err, 'not_found')) return eventNotFound(reply);
        if (!isDomainError(err, 'not_cancellable')) throw err;
        const event = await findOwnedEvent(organizerId, id);
        if (!event) return eventNotFound(reply);
        return renderManagePage(reply, event, { errors: [err.message] }, 409);
      }
    });
  },
};
