// Purchase core (R03, R05, R06, R07, R08, R09): the single path that creates tickets.
// Showcase (F04) and partner API (F05) call purchaseTicket; nothing else inserts tickets.
import { withTransaction, type DbClient } from '../db/pool.ts';
import { getGateway } from '../gateway/payment-gateway.ts';
import { DomainError } from '../lib/errors.ts';
import { newId, newTicketCode } from '../lib/ids.ts';
import { logger } from '../observability/logger.ts';
import { countOccupiedSeats, lockEvent } from './seats.ts';
import type { SalesChannel, TicketRow } from './types.ts';

export interface PurchaseInput {
  eventId: string;
  channel: SalesChannel;
  buyerEmail: string;
  buyerUserId?: string | null;
  partnerId?: string | null;
  cardNumber: string;
}

const CARD_RE = /^\d{16}$/;
const MAX_CODE_ATTEMPTS = 5;

interface PgError {
  code?: string;
  constraint?: string;
}

function isCodeCollision(err: unknown): boolean {
  const e = err as PgError;
  return e?.code === '23505' && e.constraint === 'tickets_code_key';
}

/** Inserts the pending ticket, retrying with a new code on a (rare) code collision. */
async function insertPendingTicket(
  client: DbClient,
  input: PurchaseInput,
  priceCents: number,
): Promise<TicketRow> {
  const id = newId('tkt');
  const last4 = input.cardNumber.slice(-4);
  for (let attempt = 1; ; attempt++) {
    // A savepoint keeps the transaction (and the event lock) usable after a unique violation.
    await client.query('SAVEPOINT ticket_code');
    try {
      const { rows } = await client.query<TicketRow>(
        `INSERT INTO tickets (id, event_id, code, status, price_cents, channel, buyer_user_id,
                              buyer_email, partner_id, card_last4)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          id,
          input.eventId,
          newTicketCode(),
          priceCents,
          input.channel,
          input.buyerUserId ?? null,
          input.buyerEmail,
          input.partnerId ?? null,
          last4,
        ],
      );
      await client.query('RELEASE SAVEPOINT ticket_code');
      return rows[0]!;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT ticket_code');
      if (!isCodeCollision(err) || attempt >= MAX_CODE_ATTEMPTS) throw err;
      logger.warn({ attempt, eventId: input.eventId }, 'ticket code collision, retrying');
    }
  }
}

/**
 * Buys one ticket. Order: validate card (nothing touches the DB on failure) → lock the event →
 * check status and free seats → insert pending ticket at the current price → ask the gateway and
 * schedule its decision for the worker → commit. Never waits for the gateway (R09) and never
 * stores the full card number (only the last 4 digits).
 */
export async function purchaseTicket(input: PurchaseInput): Promise<TicketRow> {
  if (typeof input.cardNumber !== 'string' || !CARD_RE.test(input.cardNumber)) {
    throw new DomainError('invalid_card', 'O número do cartão deve ter 16 dígitos');
  }

  const ticket = await withTransaction(async (client) => {
    const event = await lockEvent(client, input.eventId);
    if (!event || event.status !== 'published') {
      throw new DomainError('event_not_available', 'Evento não disponível para venda');
    }
    const occupied = await countOccupiedSeats(client, event.id);
    if (occupied >= event.capacity) {
      throw new DomainError('sold_out', 'Ingressos esgotados');
    }

    const created = await insertPendingTicket(client, input, event.price_cents);

    const { decision, delayMs } = getGateway().submit({
      ticketId: created.id,
      cardNumber: input.cardNumber,
    });
    await client.query(
      `INSERT INTO payment_jobs (id, ticket_id, card_last4, decision, due_at, state)
       VALUES ($1, $2, $3, $4, clock_timestamp() + make_interval(secs => $5::double precision / 1000), 'scheduled')`,
      [newId('pay'), created.id, created.card_last4, decision, delayMs],
    );
    return created;
  });

  logger.info(
    { ticketId: ticket.id, eventId: ticket.event_id, channel: ticket.channel },
    'ticket purchased (pending)',
  );
  return ticket;
}
