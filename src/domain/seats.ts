// Seat accounting (R05) — the single source of truth used by purchase, capacity edits,
// cancellation, the partner API listing and the dashboard.
import type { Queryable } from '../db/pool.ts';
import type { EventRow } from './types.ts';

/**
 * Locks the event row until the end of the current transaction (SELECT ... FOR UPDATE).
 * Every operation that changes occupancy or capacity takes this lock first, which serializes
 * purchases, capacity edits and cancellation of the same event (R03, R07, R11).
 */
export async function lockEvent(client: Queryable, eventId: string): Promise<EventRow | null> {
  const { rows } = await client.query<EventRow>('SELECT * FROM events WHERE id = $1 FOR UPDATE', [
    eventId,
  ]);
  return rows[0] ?? null;
}

/** Occupied seats = pending + confirmed tickets (R05). */
export async function countOccupiedSeats(client: Queryable, eventId: string): Promise<number> {
  const { rows } = await client.query<{ occupied: number }>(
    "SELECT count(*)::int AS occupied FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')",
    [eventId],
  );
  return rows[0]?.occupied ?? 0;
}

/** Available seats = capacity - occupied; always 0 for a cancelled event (R05). */
export function availableSeats(
  event: Pick<EventRow, 'capacity' | 'status'>,
  occupied: number,
): number {
  if (event.status === 'cancelled') return 0;
  return Math.max(0, event.capacity - occupied);
}

/** SQL fragment computing occupied seats per event, for listing queries (alias `e` for events). */
export const OCCUPIED_SEATS_SQL =
  "(SELECT count(*)::int FROM tickets t WHERE t.event_id = e.id AND t.status IN ('pending', 'confirmed'))";
