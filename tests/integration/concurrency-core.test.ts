// F03: R07 proof — concurrent purchases never oversell (C-F03-02).
// Calls purchaseTicket directly; the test process uses its own pg pool (DB_POOL_MAX, default 20),
// so requests queue for connections and then for the event lock, as in production.
import { describe, expect, it } from 'vitest';
import { purchaseTicket } from '../../src/domain/purchase.ts';
import { isDomainError } from '../../src/lib/errors.ts';
import { CARDS, db, insertEvent, uniqueEmail } from './helpers.ts';

async function burst(eventId: string, n: number): Promise<{ ok: number; soldOut: number }> {
  const results = await Promise.allSettled(
    Array.from({ length: n }, (_, i) =>
      purchaseTicket({
        eventId,
        channel: i % 2 === 0 ? 'web' : 'partner',
        buyerEmail: uniqueEmail('burst'),
        // Approved cards: no decline can free a seat during the burst.
        cardNumber: CARDS.approveSlow,
      }),
    ),
  );
  let ok = 0;
  let soldOut = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok++;
    else if (isDomainError(r.reason, 'sold_out')) soldOut++;
    else throw r.reason;
  }
  return { ok, soldOut };
}

async function ticketCount(eventId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tickets WHERE event_id = $1',
    [eventId],
  );
  return rows[0]!.n;
}

describe('F03 concurrency (R07)', () => {
  it('20 fresh events × 30 concurrent purchases at capacity 5 → exactly 5 tickets each', async () => {
    for (let round = 0; round < 20; round++) {
      const eventId = await insertEvent({ capacity: 5 });
      const { ok, soldOut } = await burst(eventId, 30);
      expect({ round, ok, soldOut }).toEqual({ round, ok: 5, soldOut: 25 });
      expect(await ticketCount(eventId)).toBe(5);
    }
  });

  it('200 concurrent purchases at capacity 37 → exactly 37 tickets', async () => {
    const eventId = await insertEvent({ capacity: 37 });
    const { ok, soldOut } = await burst(eventId, 200);
    expect(ok).toBe(37);
    expect(soldOut).toBe(163);
    expect(await ticketCount(eventId)).toBe(37);
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(DISTINCT code)::int AS n FROM tickets WHERE event_id = $1',
      [eventId],
    );
    expect(rows[0]!.n).toBe(37);
  });
});
