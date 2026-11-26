// F03: ticket code collision → retry with a new code (up to 5 attempts) inside the same transaction.
import { describe, expect, it, vi } from 'vitest';
import * as ids from '../../src/lib/ids.ts';
import { purchaseTicket } from '../../src/domain/purchase.ts';
import { CARDS, db, insertEvent, uniqueEmail } from './helpers.ts';

vi.mock('../../src/lib/ids.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/ids.ts')>();
  return { ...actual, newTicketCode: vi.fn(actual.newTicketCode) };
});

const buy = (eventId: string) =>
  purchaseTicket({
    eventId,
    channel: 'web',
    buyerEmail: uniqueEmail('retry'),
    cardNumber: CARDS.approveSlow,
  });

describe('F03 ticket code uniqueness', () => {
  it('retries with another code when the generated one already exists', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const first = await buy(eventId);
    const mocked = vi.mocked(ids.newTicketCode);
    mocked.mockReturnValueOnce(first.code).mockReturnValueOnce(first.code);
    const second = await buy(eventId);
    expect(second.code).not.toBe(first.code);
    expect(second.code).toMatch(/^[A-Z2-9]{8}$/);
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM payment_jobs WHERE ticket_id = $1',
      [second.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('gives up after 5 collisions and creates nothing', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const first = await buy(eventId);
    const mocked = vi.mocked(ids.newTicketCode);
    for (let i = 0; i < 5; i++) mocked.mockReturnValueOnce(first.code);
    await expect(buy(eventId)).rejects.toMatchObject({ code: '23505' });
    const { rows } = await db.query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [
      eventId,
    ]);
    expect(rows[0].n).toBe(1);
  });
});
