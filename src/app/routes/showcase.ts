// Public showcase and participant area (F04): showcase, event page with purchase, "Meus ingressos".
// Purchases go exclusively through the F03 core (purchaseTicket); this file only maps the
// domain error codes to HTTP status codes and pages.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireParticipant, type CurrentUser } from '../auth.ts';
import {
  getPublishedEvent,
  listPublishedEvents,
  type PublishedEvent,
} from '../../domain/events.ts';
import { purchaseTicket } from '../../domain/purchase.ts';
import { TICKET_STATUS_LABEL, listTicketsForUser } from '../../domain/tickets.ts';
import { isDomainError } from '../../lib/errors.ts';

type IdParams = { id: string };
type PurchaseBody = { cardNumber?: unknown };

const FLASH_MESSAGES: Readonly<Record<string, string>> = {
  purchased: 'Compra registrada! Status pendente até a resposta do pagamento.',
};

function eventNotFound(reply: FastifyReply): FastifyReply {
  return reply
    .code(404)
    .view('error.ejs', { title: 'Evento não encontrado', message: 'Evento não encontrado.' });
}

function renderEvent(
  reply: FastifyReply,
  event: PublishedEvent,
  user: CurrentUser | null,
  extra: { error?: string | null; soldOut?: boolean } = {},
): FastifyReply {
  return reply.view('showcase/event.ejs', {
    title: event.name,
    event,
    soldOut: extra.soldOut ?? event.availableSeats <= 0,
    error: extra.error ?? null,
    viewer: user ? user.role : 'visitor',
  });
}

export default async function showcaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    const events = await listPublishedEvents();
    return reply.view('showcase/index.ejs', { title: 'Vitrine', events });
  });

  app.get<{ Params: IdParams }>('/events/:id', async (request, reply) => {
    const event = await getPublishedEvent(request.params.id);
    if (!event) return eventNotFound(reply);
    return renderEvent(reply, event, request.user);
  });

  app.post<{ Params: IdParams; Body: PurchaseBody }>(
    '/events/:id/purchase',
    {
      preHandler: [
        // Visitors go to the login and come back to the event page (not to this POST URL).
        async (request, reply) => {
          if (!request.user) {
            const next = encodeURIComponent(`/events/${request.params.id}`);
            return reply.redirect(`/login?next=${next}`, 302);
          }
        },
        requireParticipant,
      ],
    },
    async (request, reply) => {
      const user = request.user!;
      const eventId = request.params.id;
      const raw = request.body?.cardNumber;
      const cardNumber = typeof raw === 'string' ? raw.trim() : '';
      try {
        await purchaseTicket({
          eventId,
          channel: 'web',
          buyerUserId: user.id,
          buyerEmail: user.email,
          cardNumber,
        });
        return reply.redirect('/me/tickets?ok=purchased', 303);
      } catch (err) {
        if (!isDomainError(err)) throw err;
        if (err.code === 'event_not_available') return eventNotFound(reply);
        if (err.code !== 'sold_out' && err.code !== 'invalid_card') throw err;
        const event = await getPublishedEvent(eventId);
        if (!event) return eventNotFound(reply);
        if (err.code === 'sold_out') {
          return renderEvent(reply.code(409), event, user, { soldOut: true });
        }
        return renderEvent(reply.code(422), event, user, { error: err.message });
      }
    },
  );

  app.get<{ Querystring: { ok?: string } }>(
    '/me/tickets',
    { preHandler: requireParticipant },
    async (request, reply) => {
      const tickets = await listTicketsForUser(request.user!.id);
      const ok = request.query.ok;
      return reply.view('showcase/tickets.ejs', {
        title: 'Meus ingressos',
        tickets,
        statusLabels: TICKET_STATUS_LABEL,
        flash: ok ? (FLASH_MESSAGES[ok] ?? null) : null,
      });
    },
  );
}
