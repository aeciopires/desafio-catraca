// Event cancellation (R11) — the only place where an event is cancelled. Everything happens in a
// single transaction under the event lock (the same lock purchases take), so a purchase either
// commits before the cancellation (and its ticket is cancelled/refunded here) or sees the event
// as cancelled and is refused. Late gateway answers are ignored because the worker only ever
// changes tickets that are still `pending`, and the scheduled jobs are marked obsolete here.
import { withTransaction } from '../db/pool.ts';
import { DomainError } from '../lib/errors.ts';
import { logger } from '../observability/logger.ts';
import { lockEvent } from './seats.ts';

export const NOT_CANCELLABLE_MESSAGE = 'Só eventos publicados podem ser cancelados';

export interface CancellationResult {
  refunded: number;
  cancelled: number;
}

/**
 * Cancels a published event of the organizer (irreversible). Throws `not_found` when the event
 * is missing or belongs to someone else, `not_cancellable` when it is not published.
 * confirmed → refunded, pending → cancelled, scheduled payment jobs → obsolete.
 */
export async function cancelEvent(
  organizerId: string,
  eventId: string,
): Promise<CancellationResult> {
  const result = await withTransaction(async (client) => {
    const event = await lockEvent(client, eventId);
    if (!event || event.organizer_id !== organizerId) {
      throw new DomainError('not_found', 'Evento não encontrado');
    }
    if (event.status !== 'published') {
      throw new DomainError('not_cancellable', NOT_CANCELLABLE_MESSAGE, [NOT_CANCELLABLE_MESSAGE]);
    }
    await client.query(
      `UPDATE events SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1`,
      [eventId],
    );
    // Jobs before tickets: the worker locks a job and then its ticket, so taking the locks in
    // the same order avoids a deadlock. If the worker is applying a job right now we wait for
    // it; the ticket updates below then see its committed result.
    const obsolete = await client.query(
      `UPDATE payment_jobs SET state = 'obsolete'
        WHERE state = 'scheduled'
          AND ticket_id IN (SELECT id FROM tickets WHERE event_id = $1)`,
      [eventId],
    );
    const refunded = await client.query(
      `UPDATE tickets SET status = 'refunded', updated_at = now()
        WHERE event_id = $1 AND status = 'confirmed'`,
      [eventId],
    );
    const cancelled = await client.query(
      `UPDATE tickets SET status = 'cancelled', updated_at = now()
        WHERE event_id = $1 AND status = 'pending'`,
      [eventId],
    );
    return {
      refunded: refunded.rowCount ?? 0,
      cancelled: cancelled.rowCount ?? 0,
      obsoleteJobs: obsolete.rowCount ?? 0,
    };
  });
  logger.info({ eventId, organizerId, ...result }, 'event cancelled');
  return { refunded: result.refunded, cancelled: result.cancelled };
}
