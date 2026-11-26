// F05: concurrency through the partner API over HTTP (C-F05-07, step 15 of the evaluator flow).
// 30 simultaneous POSTs on fresh events of capacity 5 → exactly 5 × 202 and 25 × 409.
import { describe, expect, it } from 'vitest';
import { CARDS, db, insertEvent, partner } from './helpers.ts';

const ROUNDS = 6;
const REQUESTS = 30;
const CAPACITY = 5;

async function burst(eventId: string): Promise<Record<number, number>> {
  const responses = await Promise.all(
    Array.from({ length: REQUESTS }, (_, i) =>
      partner('POST', `/api/partner/events/${eventId}/purchases`, {
        buyerEmail: `carga${i + 1}@example.com`,
        cardNumber: CARDS.approveFast,
      }),
    ),
  );
  const counts: Record<number, number> = {};
  for (const r of responses) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.status === 409) expect(r.json).toEqual({ error: 'sold_out' });
    if (r.status === 202) expect(r.json.status).toBe('pending');
  }
  return counts;
}

describe('F05 concurrency over HTTP (R07)', () => {
  it(`${ROUNDS} fresh events × ${REQUESTS} concurrent API purchases at capacity ${CAPACITY}`, async () => {
    for (let round = 1; round <= ROUNDS; round++) {
      const eventId = await insertEvent({ capacity: CAPACITY, priceCents: 1000 });
      const counts = await burst(eventId);
      expect(counts, `round ${round}`).toEqual({ 202: CAPACITY, 409: REQUESTS - CAPACITY });
      const { rows } = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM tickets WHERE event_id = $1',
        [eventId],
      );
      expect(rows[0]!.n).toBe(CAPACITY);
    }
  });
});
