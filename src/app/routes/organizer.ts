// Organizer area (F02): "Meus eventos", create/edit/publish and the event management page with
// extensible sections (R01–R04, R13). Every route of this plugin — including the routes that
// management-page sections register — runs behind requireOrganizer.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireOrganizer } from '../auth.ts';
import { renderManagePage, STATUS_LABELS } from '../manage-sections.ts';
import { sections } from '../sections/index.ts';
import {
  createEvent,
  findOwnedEvent,
  listOrganizerEvents,
  publishEvent,
  updateEvent,
} from '../../domain/events.ts';
import { isDomainError } from '../../lib/errors.ts';

type Body = Record<string, unknown>;
type IdParams = { id: string };

const FORM_FIELDS = ['name', 'startsAt', 'venue', 'capacity', 'price'] as const;
const EMPTY_FORM = { name: '', startsAt: '', venue: '', capacity: '', price: '' };

/** Echoes the submitted values back into the form after a validation error. */
function formFromBody(body: Body): Record<string, string> {
  const form: Record<string, string> = {};
  for (const field of FORM_FIELDS) {
    const value = body[field];
    form[field] = typeof value === 'string' ? value : '';
  }
  return form;
}

/** Generic 404 that reveals nothing about the event (missing or owned by someone else). */
function eventNotFound(reply: FastifyReply): FastifyReply {
  return reply
    .code(404)
    .view('error.ejs', { title: 'Evento não encontrado', message: 'Evento não encontrado.' });
}

function errorsOf(err: { message: string; details: string[] }): string[] {
  return err.details.length ? err.details : [err.message];
}

export default async function organizerRoutes(app: FastifyInstance): Promise<void> {
  // Encapsulated hook: applies to every route below and to the sections' extra routes.
  app.addHook('preHandler', requireOrganizer);

  app.get('/organizer/events', async (request, reply) => {
    const events = await listOrganizerEvents(request.user!.id);
    return reply.view('organizer/list.ejs', {
      title: 'Meus eventos',
      events,
      statusLabels: STATUS_LABELS,
    });
  });

  app.get('/organizer/events/new', async (_request, reply) => {
    return reply.view('organizer/new.ejs', { title: 'Novo evento', errors: [], form: EMPTY_FORM });
  });

  app.post<{ Body: Body }>('/organizer/events', async (request, reply) => {
    const body = request.body ?? {};
    try {
      const event = await createEvent(request.user!.id, body);
      return reply.redirect(`/organizer/events/${encodeURIComponent(event.id)}`, 303);
    } catch (err) {
      if (!isDomainError(err, 'validation_failed')) throw err;
      return reply.code(422).view('organizer/new.ejs', {
        title: 'Novo evento',
        errors: errorsOf(err),
        form: formFromBody(body),
      });
    }
  });

  app.get<{ Params: IdParams; Querystring: { ok?: string } }>(
    '/organizer/events/:id',
    async (request, reply) => {
      const event = await findOwnedEvent(request.user!.id, request.params.id);
      if (!event) return eventNotFound(reply);
      return renderManagePage(reply, event, { ok: request.query.ok ?? '' });
    },
  );

  app.post<{ Params: IdParams; Body: Body }>('/organizer/events/:id', async (request, reply) => {
    const organizerId = request.user!.id;
    const { id } = request.params;
    const body = request.body ?? {};
    try {
      await updateEvent(organizerId, id, body);
      return reply.redirect(`/organizer/events/${encodeURIComponent(id)}?ok=updated`, 303);
    } catch (err) {
      if (isDomainError(err, 'not_found')) return eventNotFound(reply);
      if (
        !isDomainError(err, 'validation_failed') &&
        !isDomainError(err, 'capacity_below_occupied') &&
        !isDomainError(err, 'event_cancelled')
      ) {
        throw err;
      }
      const event = await findOwnedEvent(organizerId, id);
      if (!event) return eventNotFound(reply);
      return renderManagePage(
        reply,
        event,
        { errors: errorsOf(err), form: formFromBody(body) },
        422,
      );
    }
  });

  app.post<{ Params: IdParams }>('/organizer/events/:id/publish', async (request, reply) => {
    const organizerId = request.user!.id;
    const { id } = request.params;
    try {
      await publishEvent(organizerId, id);
      return reply.redirect(`/organizer/events/${encodeURIComponent(id)}?ok=published`, 303);
    } catch (err) {
      if (isDomainError(err, 'not_found')) return eventNotFound(reply);
      if (!isDomainError(err, 'event_cancelled')) throw err;
      const event = await findOwnedEvent(organizerId, id);
      if (!event) return eventNotFound(reply);
      return renderManagePage(reply, event, { errors: errorsOf(err) }, 422);
    }
  });

  // Extra routes of the management-page sections (check-in, cancellation, ...).
  for (const section of sections) section.register?.(app);
}
