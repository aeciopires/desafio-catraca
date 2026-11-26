// Event dashboard (F08, R12): the six numbers of the management page, computed from the tickets'
// state in a single aggregate query — never from parallel counters. Web and partner API sales
// are the same tickets, so both channels are counted alike.
import { query } from '../db/pool.ts';
import { availableSeats } from './seats.ts';
import type { EventRow } from './types.ts';

/** Raw per-status counts of an event's tickets. */
export interface DashboardCounts {
  confirmed: number; // status confirmed (includes checked-in tickets)
  pending: number;
  checkins: number; // confirmed AND checked_in
  refunded: number;
  revenueCents: number; // sum of the frozen price of confirmed tickets only
}

export interface Dashboard extends DashboardCounts {
  available: number; // R05: capacity - (pending + confirmed); 0 when cancelled
}

/** Pure assembly of the dashboard from the counts (unit-testable). */
export function buildDashboard(
  counts: DashboardCounts,
  event: Pick<EventRow, 'capacity' | 'status'>,
): Dashboard {
  return {
    ...counts,
    available: availableSeats(event, counts.confirmed + counts.pending),
  };
}

const DASHBOARD_SQL = `
  SELECT
    count(*) FILTER (WHERE status = 'confirmed')::int                    AS confirmed,
    count(*) FILTER (WHERE status = 'pending')::int                      AS pending,
    count(*) FILTER (WHERE status = 'confirmed' AND checked_in)::int     AS checkins,
    count(*) FILTER (WHERE status = 'refunded')::int                     AS refunded,
    coalesce(sum(price_cents) FILTER (WHERE status = 'confirmed'), 0)::bigint AS revenue_cents
  FROM tickets WHERE event_id = $1`;

/** Dashboard of an event (the caller has already verified ownership). */
export async function getDashboard(event: EventRow): Promise<Dashboard> {
  const { rows } = await query<{
    confirmed: number;
    pending: number;
    checkins: number;
    refunded: number;
    revenue_cents: number;
  }>(DASHBOARD_SQL, [event.id]);
  const row = rows[0]!;
  return buildDashboard(
    {
      confirmed: Number(row.confirmed),
      pending: Number(row.pending),
      checkins: Number(row.checkins),
      refunded: Number(row.refunded),
      revenueCents: Number(row.revenue_cents),
    },
    event,
  );
}
