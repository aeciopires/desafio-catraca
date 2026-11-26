// Check-in (F06, R10): validates a ticket code at the entrance of an event. The decision follows
// the exact order of R10; the ticket row is locked (FOR UPDATE) so concurrent check-ins of the
// same code release the entrance only once.
import { withTransaction } from '../db/pool.ts';
import type { EventRow, TicketRow } from './types.ts';

export const CHECKIN_MESSAGES = {
  invalid: 'Ingresso inválido para este evento',
  cancelled: 'Evento cancelado',
  notConfirmed: 'Ingresso não confirmado',
  alreadyUsed: 'Ingresso já utilizado',
  ok: 'Entrada liberada',
} as const;

export type CheckinResultKey = keyof typeof CHECKIN_MESSAGES;

export interface CheckinResult {
  result: CheckinResultKey;
  message: string;
}

/**
 * Pure R10 decision: the first true condition, in order, wins.
 * 1. missing ticket or ticket of another event → invalid
 * 2. event cancelled → cancelled
 * 3. ticket not confirmed → notConfirmed
 * 4. ticket already checked in → alreadyUsed
 * 5. otherwise → ok
 */
export function decideCheckin(
  ticket: Pick<TicketRow, 'event_id' | 'status' | 'checked_in'> | null,
  eventId: string,
  event: Pick<EventRow, 'status'>,
): CheckinResultKey {
  if (!ticket || ticket.event_id !== eventId) return 'invalid';
  if (event.status === 'cancelled') return 'cancelled';
  if (ticket.status !== 'confirmed') return 'notConfirmed';
  if (ticket.checked_in) return 'alreadyUsed';
  return 'ok';
}

/** Normalizes a typed code: surrounding spaces ignored, case-insensitive. */
export function normalizeCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

/**
 * Checks a ticket code in at the given event (ownership must already be verified by the caller).
 * Runs in a transaction with the ticket row locked, so only one concurrent request can mark it.
 */
export async function checkIn(eventId: string, rawCode: string): Promise<CheckinResult> {
  const code = normalizeCode(rawCode);
  const result = await withTransaction(async (client): Promise<CheckinResultKey> => {
    const ticket =
      code === ''
        ? null
        : ((
            await client.query<TicketRow>('SELECT * FROM tickets WHERE code = $1 FOR UPDATE', [
              code,
            ])
          ).rows[0] ?? null);
    const { rows: events } = await client.query<EventRow>('SELECT * FROM events WHERE id = $1', [
      eventId,
    ]);
    const event = events[0];
    if (!event) return 'invalid';
    const decision = decideCheckin(ticket, eventId, event);
    if (decision === 'ok') {
      await client.query(
        `UPDATE tickets SET checked_in = true, checked_in_at = now(), updated_at = now()
          WHERE id = $1`,
        [ticket!.id],
      );
    }
    return decision;
  });
  return { result, message: CHECKIN_MESSAGES[result] };
}
