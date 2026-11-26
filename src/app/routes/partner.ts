// Partner API under /api/partner (F05). Fixed contract from TASK.md: every route requires a valid
// X-Api-Key (401 {"error":"unauthorized"} otherwise). Business rules live in the domain modules
// (listPublishedEvents, purchaseTicket, findTicketById); this file only adapts them to HTTP.
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../../db/pool.ts';
import { hashApiKey } from '../../db/seed.ts';
import { listPublishedEvents } from '../../domain/events.ts';
import { purchaseTicket } from '../../domain/purchase.ts';
import { purchasesRejected } from '../../observability/metrics.ts';
import { findTicketById } from '../../domain/tickets.ts';
import { isDomainError } from '../../lib/errors.ts';
import { toIsoOffset } from '../../lib/time.ts';
import { partnerSchemas } from './docs.ts';

export interface PartnerIdentity {
  id: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    partner?: PartnerIdentity;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_RE = /^\d{16}$/;

type ErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'event_not_available'
  | 'sold_out'
  | 'ticket_not_found'
  | 'internal_error';

function sendError(reply: FastifyReply, status: number, error: ErrorCode): FastifyReply {
  return reply.code(status).send({ error });
}

async function findPartnerByKey(key: string): Promise<PartnerIdentity | null> {
  const { rows } = await query<PartnerIdentity>(
    'SELECT id, name FROM partners WHERE api_key_hash = $1',
    [hashApiKey(key)],
  );
  return rows[0] ?? null;
}

/** onRequest hook: runs before body parsing, so an invalid body never hides a missing key. */
async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers['x-api-key'];
  const key = Array.isArray(header) ? header[0] : header;
  const partner = typeof key === 'string' && key !== '' ? await findPartnerByKey(key) : null;
  if (!partner) {
    return sendError(reply, 401, 'unauthorized');
  }
  request.partner = partner;
}

interface PurchaseBody {
  buyerEmail: string;
  cardNumber: string;
}

function isJson(request: FastifyRequest): boolean {
  const type = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  return type === 'application/json' || type.endsWith('+json');
}

/** Manual body validation (contract order: body first, then event, then seats). */
function parsePurchaseBody(request: FastifyRequest): PurchaseBody | null {
  // The contract body is JSON; other parsed content types (e.g. forms) are invalid requests.
  if (!isJson(request)) return null;
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { buyerEmail, cardNumber } = body as Record<string, unknown>;
  if (typeof buyerEmail !== 'string' || !EMAIL_RE.test(buyerEmail)) return null;
  if (typeof cardNumber !== 'string' || !CARD_RE.test(cardNumber)) return null;
  return { buyerEmail, cardNumber };
}

export default async function partnerRoutes(app: FastifyInstance): Promise<void> {
  // Schemas document the API only: no validation/coercion (the contract fixes the error order and
  // format) and no schema-driven serialization (responses are built with exactly the contract
  // fields).
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  app.addHook('onRequest', requireApiKey);

  // Body parsing errors (broken JSON, unsupported content type, empty body...) are an invalid
  // request for this API, never 400/415/500.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const status = err.statusCode ?? 500;
    if (err.code?.startsWith('FST_ERR_CTP_') || (status >= 400 && status < 500)) {
      return sendError(reply, 422, 'invalid_request');
    }
    request.log.error({ err, code: 'PARTNER_API_ERROR' }, 'unhandled partner API error');
    return sendError(reply, 500, 'internal_error');
  });

  app.get('/events', { schema: partnerSchemas.listEvents }, async () => {
    const events = await listPublishedEvents();
    return events.map((e) => ({
      id: e.id,
      name: e.name,
      startsAt: toIsoOffset(e.starts_at),
      priceCents: e.price_cents,
      availableSeats: e.availableSeats,
    }));
  });

  app.post<{ Params: { eventId: string } }>(
    '/events/:eventId/purchases',
    { schema: partnerSchemas.purchase },
    async (request, reply) => {
      const body = parsePurchaseBody(request);
      if (!body) {
        purchasesRejected.inc({ reason: 'invalid_request' });
        return sendError(reply, 422, 'invalid_request');
      }
      try {
        const ticket = await purchaseTicket({
          eventId: request.params.eventId,
          channel: 'partner',
          partnerId: request.partner!.id,
          buyerEmail: body.buyerEmail,
          cardNumber: body.cardNumber,
        });
        return reply.code(202).send({ ticketId: ticket.id, code: ticket.code, status: 'pending' });
      } catch (err) {
        if (isDomainError(err, 'invalid_card')) return sendError(reply, 422, 'invalid_request');
        if (isDomainError(err, 'event_not_available'))
          return sendError(reply, 404, 'event_not_available');
        if (isDomainError(err, 'sold_out')) return sendError(reply, 409, 'sold_out');
        throw err;
      }
    },
  );

  app.get<{ Params: { ticketId: string } }>(
    '/tickets/:ticketId',
    { schema: partnerSchemas.ticket },
    async (request, reply) => {
      const ticket = await findTicketById(request.params.ticketId);
      if (!ticket) return sendError(reply, 404, 'ticket_not_found');
      return {
        ticketId: ticket.id,
        code: ticket.code,
        eventId: ticket.event_id,
        status: ticket.status,
        checkedIn: ticket.checked_in,
      };
    },
  );
}
