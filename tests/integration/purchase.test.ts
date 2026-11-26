// F03: purchase core + payment worker against the Compose Postgres (C-F03-01, 03..08).
// The "worker" service of the stack applies the decisions (GATEWAY_DELAY_SCALE=0.1 in tests).
import { describe, expect, it } from 'vitest';
import { purchaseTicket, type PurchaseInput } from '../../src/domain/purchase.ts';
import { countOccupiedSeats } from '../../src/domain/seats.ts';
import {
  TICKET_STATUS_LABEL,
  findTicketByCode,
  findTicketById,
  listTicketsForUser,
} from '../../src/domain/tickets.ts';
import type { TicketStatus } from '../../src/domain/types.ts';
import { isDomainError } from '../../src/lib/errors.ts';
import {
  CARDS,
  DELAY_SCALE,
  db,
  insertEvent,
  scaled,
  seedUserId,
  uniqueEmail,
  waitFor,
} from './helpers.ts';

function buy(eventId: string, cardNumber: string, extra: Partial<PurchaseInput> = {}) {
  return purchaseTicket({
    eventId,
    channel: 'web',
    buyerEmail: uniqueEmail('buyer'),
    cardNumber,
    ...extra,
  });
}

async function statusOf(ticketId: string): Promise<TicketStatus> {
  return (await findTicketById(ticketId))!.status;
}

function waitStatus(ticketId: string, status: TicketStatus, timeoutMs: number) {
  return waitFor(async () => (await statusOf(ticketId)) === status, timeoutMs);
}

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(isDomainError(err), `expected DomainError(${code}), got ${String(err)}`).toBe(true);
  expect((err as { code: string }).code).toBe(code);
}

async function occupied(eventId: string): Promise<number> {
  return countOccupiedSeats(db, eventId);
}

describe('F03 purchase core', () => {
  it('C-F03-01: creates a pending ticket with a code, without waiting for the gateway', async () => {
    const eventId = await insertEvent({ capacity: 3 });
    const started = Date.now();
    const ticket = await buy(eventId, CARDS.approveSlow, { channel: 'partner' });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ticket.status).toBe('pending');
    expect(ticket.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(ticket.channel).toBe('partner');
    expect(ticket.event_id).toBe(eventId);
    expect(ticket.card_last4).toBe('0003');
    expect(await statusOf(ticket.id)).toBe('pending');

    const web = await buy(eventId, CARDS.approveSlow);
    expect(web.channel).toBe('web');
    expect(web.code).not.toBe(ticket.code);
  });

  it('rejects purchases for missing, draft and cancelled events (event_not_available)', async () => {
    const draft = await insertEvent({ status: 'draft' });
    const cancelled = await insertEvent({ status: 'cancelled' });
    await expectDomainError(buy('evt_doesnotexist', CARDS.approveFast), 'event_not_available');
    await expectDomainError(buy(draft, CARDS.approveFast), 'event_not_available');
    await expectDomainError(buy(cancelled, CARDS.approveFast), 'event_not_available');
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM tickets WHERE event_id = ANY($1)',
      [[draft, cancelled]],
    );
    expect(rows[0].n).toBe(0);
  });

  it('C-F03-02: capacity 1 with one pending ticket → sold_out', async () => {
    const eventId = await insertEvent({ capacity: 1 });
    await buy(eventId, CARDS.approveSlow);
    await expectDomainError(buy(eventId, CARDS.approveFast), 'sold_out');
  });

  it('C-F03-03: gateway table applied end to end by the worker', async () => {
    const eventId = await insertEvent({ capacity: 10 });
    const expected = [
      { card: CARDS.approveFast, final: 'confirmed', min: 2000, max: 4000 },
      { card: CARDS.declineFast, final: 'declined', min: 2000, max: 4000 },
      { card: CARDS.other, final: 'declined', min: 2000, max: 4000 },
      { card: CARDS.approveSlow, final: 'confirmed', min: 30000, max: 39000 },
      { card: CARDS.declineSlow, final: 'declined', min: 30000, max: 39000 },
    ] as const;
    const tickets = [];
    for (const e of expected) tickets.push({ ...e, ticket: await buy(eventId, e.card) });

    // Scheduled delay (due_at - created_at) lies in the brief's range × GATEWAY_DELAY_SCALE.
    for (const t of tickets) {
      const { rows } = await db.query(
        `SELECT decision, extract(epoch FROM (j.due_at - t.created_at)) * 1000 AS delay_ms
           FROM payment_jobs j JOIN tickets t ON t.id = j.ticket_id WHERE j.ticket_id = $1`,
        [t.ticket.id],
      );
      expect(rows[0].decision).toBe(t.final === 'confirmed' ? 'approved' : 'declined');
      expect(Number(rows[0].delay_ms)).toBeGreaterThanOrEqual(t.min * DELAY_SCALE - 50);
      expect(Number(rows[0].delay_ms)).toBeLessThanOrEqual(t.max * DELAY_SCALE + 250);
    }

    // Fast cards are decided within the (scaled) 5 s window; slow ones are still pending then.
    for (const t of tickets.slice(0, 3)) await waitStatus(t.ticket.id, t.final, scaled(5000));
    if (DELAY_SCALE > 0) {
      expect(await statusOf(tickets[3]!.ticket.id)).toBe('pending');
      expect(await statusOf(tickets[4]!.ticket.id)).toBe('pending');
    }
    for (const t of tickets.slice(3)) await waitStatus(t.ticket.id, t.final, scaled(40000));
  });

  it('C-F03-04: a pending ticket occupies the seat and a decline frees it', async () => {
    const eventId = await insertEvent({ capacity: 1 });
    const first = await buy(eventId, CARDS.declineFast);
    await expectDomainError(buy(eventId, CARDS.approveFast), 'sold_out');
    await waitStatus(first.id, 'declined', scaled(5000));
    expect(await occupied(eventId)).toBe(0);
    const second = await buy(eventId, CARDS.approveFast);
    expect(second.status).toBe('pending');
    await waitStatus(second.id, 'confirmed', scaled(5000));
    await expectDomainError(buy(eventId, CARDS.approveFast), 'sold_out');
  });

  it('C-F03-05: the ticket keeps the price at purchase time', async () => {
    const eventId = await insertEvent({ capacity: 5, priceCents: 10000 });
    const before = await buy(eventId, CARDS.approveFast);
    await db.query('UPDATE events SET price_cents = 15000 WHERE id = $1', [eventId]);
    const after = await buy(eventId, CARDS.approveFast);
    expect(before.price_cents).toBe(10000);
    expect(after.price_cents).toBe(15000);
    expect((await findTicketById(before.id))!.price_cents).toBe(10000);
  });

  it('C-F03-06: the worker only changes pending tickets', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const approved = await buy(eventId, CARDS.approveSlow);
    const declined = await buy(eventId, CARDS.declineSlow);
    await db.query(
      "UPDATE tickets SET status = 'cancelled', updated_at = now() WHERE id = ANY($1)",
      [[approved.id, declined.id]],
    );
    for (const id of [approved.id, declined.id]) {
      await waitFor(async () => {
        const { rows } = await db.query(
          'SELECT state, processed_at FROM payment_jobs WHERE ticket_id = $1',
          [id],
        );
        return rows[0].state === 'done' && rows[0].processed_at !== null;
      }, scaled(40000));
      expect(await statusOf(id)).toBe('cancelled');
    }
  });

  it('C-F03-07: invalid card is rejected before anything is created', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const count = async () =>
      (await db.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n as number;
    const before = await count();
    for (const card of [
      '123',
      '40000000000000011',
      'abcdabcdabcdabcd',
      '4000 0000 0000 0001',
      '',
      '400000000000000',
    ]) {
      await expectDomainError(buy(eventId, card), 'invalid_card');
    }
    // A missing event with an invalid card still fails on the card (validated first).
    await expectDomainError(buy('evt_doesnotexist', '123'), 'invalid_card');
    expect(await count()).toBe(before);
  });

  it('C-F03-07: only the last 4 digits of the card are stored', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const ticket = await buy(eventId, CARDS.approveFast);
    const { rows: cols } = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('tickets', 'payment_jobs')
          AND column_name LIKE '%card%' ORDER BY table_name`,
    );
    expect(cols).toEqual([
      { table_name: 'payment_jobs', column_name: 'card_last4' },
      { table_name: 'tickets', column_name: 'card_last4' },
    ]);
    const { rows } = await db.query(
      `SELECT t.card_last4 AS t4, j.card_last4 AS j4, row_to_json(t)::text AS trow,
              row_to_json(j)::text AS jrow
         FROM tickets t JOIN payment_jobs j ON j.ticket_id = t.id WHERE t.id = $1`,
      [ticket.id],
    );
    expect(rows[0].t4).toBe('0001');
    expect(rows[0].j4).toBe('0001');
    expect(rows[0].trow).not.toContain(CARDS.approveFast);
    expect(rows[0].jrow).not.toContain(CARDS.approveFast);
  });

  it('C-F03-08: countOccupiedSeats (F01) counts pending + confirmed and ignores declined', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const ok = await buy(eventId, CARDS.approveFast);
    const ko = await buy(eventId, CARDS.declineFast);
    const pending = await buy(eventId, CARDS.approveSlow);
    expect(await occupied(eventId)).toBe(3);
    // The worker service (F01 Compose) applies the decisions.
    await waitStatus(ok.id, 'confirmed', scaled(5000));
    await waitStatus(ko.id, 'declined', scaled(5000));
    expect(await statusOf(pending.id)).toBe('pending');
    expect(await occupied(eventId)).toBe(2);
  });

  it('ticket queries: by id, by code (case/space-insensitive), by user, and labels', async () => {
    const eventId = await insertEvent({ capacity: 5, name: 'Show Consultas' });
    const userId = await seedUserId('participant');
    const t1 = await buy(eventId, CARDS.approveFast, { buyerUserId: userId });
    const t2 = await buy(eventId, CARDS.declineSlow, { buyerUserId: userId });

    expect((await findTicketById(t1.id))!.code).toBe(t1.code);
    expect(await findTicketById('tkt_missing')).toBeNull();
    expect((await findTicketByCode(`  ${t1.code.toLowerCase()} `))!.id).toBe(t1.id);
    expect(await findTicketByCode('ZZZZZZZZ')).toBeNull();
    expect(await findTicketByCode('   ')).toBeNull();

    const mine = await listTicketsForUser(userId);
    const ids = mine.map((t) => t.id);
    expect(ids.indexOf(t2.id)).toBeLessThan(ids.indexOf(t1.id)); // newest first
    const row = mine.find((t) => t.id === t1.id)!;
    expect(row.event_name).toBe('Show Consultas');
    expect(row.event_starts_at).toBeInstanceOf(Date);
    expect(await listTicketsForUser('usr_nobody')).toEqual([]);

    expect(TICKET_STATUS_LABEL).toEqual({
      pending: 'pendente',
      confirmed: 'confirmado',
      declined: 'recusado',
      cancelled: 'cancelado',
      refunded: 'estornado',
    });
  });
});
