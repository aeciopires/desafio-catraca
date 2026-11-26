// F06: check-in on the management page (C-F06-01..06, 08), with tickets bought through the real
// partner API (F05/F03) and confirmed or declined by the worker.
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  WebClient,
  db,
  hasTestId,
  insertEvent,
  loginAs,
  partner,
  scaled,
  testId,
  testIdAll,
  uniqueEmail,
  waitFor,
} from './helpers.ts';

const INVALID = 'Ingresso inválido para este evento';
const CANCELLED = 'Evento cancelado';
const NOT_CONFIRMED = 'Ingresso não confirmado';
const ALREADY_USED = 'Ingresso já utilizado';
const OK = 'Entrada liberada';

interface Bought {
  ticketId: string;
  code: string;
}

async function buy(eventId: string, card: string): Promise<Bought> {
  const res = await partner('POST', `/api/partner/events/${eventId}/purchases`, {
    buyerEmail: uniqueEmail('checkin'),
    cardNumber: card,
  });
  expect(res.status).toBe(202);
  return { ticketId: res.json.ticketId, code: res.json.code };
}

async function apiTicket(ticketId: string): Promise<any> {
  const res = await partner('GET', `/api/partner/tickets/${ticketId}`);
  expect(res.status).toBe(200);
  return res.json;
}

async function waitStatus(ticketId: string, status: string, timeoutMs: number): Promise<void> {
  await waitFor(async () => (await apiTicket(ticketId)).status === status, timeoutMs, 200);
}

/** Buys through the API with the fast-approve card and waits for the worker to confirm it. */
async function buyConfirmed(eventId: string): Promise<Bought> {
  const t = await buy(eventId, CARDS.approveFast);
  await waitStatus(t.ticketId, 'confirmed', scaled(5000));
  return t;
}

async function checkin(web: WebClient, eventId: string, code: string) {
  return web.post(`/organizer/events/${eventId}/checkin`, { code });
}

async function checkinMessage(web: WebClient, eventId: string, code: string): Promise<string> {
  const res = await checkin(web, eventId, code);
  expect(res.status).toBe(200);
  return testId(res.html, 'checkin-result') ?? '';
}

async function dbTicket(ticketId: string) {
  const { rows } = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  return rows[0];
}

describe('F06 check-in', () => {
  it('C-F06-08: the form is on the owner management page, without a result before submitting', async () => {
    const web = await loginAs('orgA');
    const eventId = await insertEvent({ organizer: 'orgA' });
    const page = await web.get(`/organizer/events/${eventId}`);
    expect(page.status).toBe(200);
    expect(hasTestId(page.html, 'checkin-form')).toBe(true);
    expect(page.html).toContain(`action="/organizer/events/${eventId}/checkin"`);
    expect(page.html).toMatch(/name="code"/);
    expect(hasTestId(page.html, 'checkin-result')).toBe(false);
  });

  it('C-F06-01: unknown code and a confirmed ticket of another event → invalid', async () => {
    const web = await loginAs('orgA');
    const e1 = await insertEvent({ organizer: 'orgA' });
    const e2 = await insertEvent({ organizer: 'orgB' });
    const other = await buyConfirmed(e2);

    expect(await checkinMessage(web, e1, 'ZZZZZZZZ')).toBe(INVALID);
    expect(await checkinMessage(web, e1, '')).toBe(INVALID);
    expect(await checkinMessage(web, e1, other.code)).toBe(INVALID);
    // The other event's ticket was not touched.
    expect((await apiTicket(other.ticketId)).checkedIn).toBe(false);
  });

  it('C-F06-03: pending (…0003) and declined (…0002) tickets → not confirmed', async () => {
    const web = await loginAs('orgA');
    const eventId = await insertEvent({ organizer: 'orgA' });
    const pending = await buy(eventId, CARDS.approveSlow);
    const declined = await buy(eventId, CARDS.declineFast);
    // Checked right away: the slow card stays pending for 30–40 s (scaled in tests).
    expect(await checkinMessage(web, eventId, pending.code)).toBe(NOT_CONFIRMED);
    expect((await apiTicket(pending.ticketId)).status).toBe('pending');

    await waitStatus(declined.ticketId, 'declined', scaled(5000));
    expect(await checkinMessage(web, eventId, declined.code)).toBe(NOT_CONFIRMED);
    expect((await dbTicket(pending.ticketId)).checked_in).toBe(false);
    expect((await dbTicket(declined.ticketId)).checked_in).toBe(false);
  });

  it('C-F06-05/04: first check-in → released (checkedIn true in the API); second → already used', async () => {
    const web = await loginAs('orgA');
    const eventId = await insertEvent({ organizer: 'orgA' });
    const t = await buyConfirmed(eventId);
    expect((await apiTicket(t.ticketId)).checkedIn).toBe(false);

    // Code typed in lowercase with spaces is normalized.
    expect(await checkinMessage(web, eventId, `  ${t.code.toLowerCase()} `)).toBe(OK);
    const after = await apiTicket(t.ticketId);
    expect(after).toMatchObject({ ticketId: t.ticketId, status: 'confirmed', checkedIn: true });
    const row = await dbTicket(t.ticketId);
    expect(row.checked_in_at).not.toBeNull();

    expect(await checkinMessage(web, eventId, t.code)).toBe(ALREADY_USED);
    // The result is rendered within the management page (F02), which still shows the event.
    const res = await checkin(web, eventId, t.code);
    expect(testId(res.html, 'event-name')).not.toBeNull();
    expect(hasTestId(res.html, 'checkin-form')).toBe(true);
  });

  it('C-F06-05: 10 concurrent check-ins of the same code → exactly one released', async () => {
    const web = await loginAs('orgA');
    const eventId = await insertEvent({ organizer: 'orgA' });
    const t = await buyConfirmed(eventId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkinMessage(web, eventId, t.code)),
    );
    expect(results.filter((m) => m === OK)).toHaveLength(1);
    expect(results.filter((m) => m === ALREADY_USED)).toHaveLength(9);
    expect((await apiTicket(t.ticketId)).checkedIn).toBe(true);
  });

  it('C-F06-06: organizer B cannot check in on A’s event (404) and the ticket is unchanged', async () => {
    const webB = await loginAs('orgB');
    const eventId = await insertEvent({ organizer: 'orgA' });
    const t = await buyConfirmed(eventId);

    const res = await checkin(webB, eventId, t.code);
    expect(res.status).toBe(404);
    expect(hasTestId(res.html, 'checkin-result')).toBe(false);
    expect(testIdAll(res.html, 'event-name')).toEqual([]);
    expect((await apiTicket(t.ticketId)).checkedIn).toBe(false);

    // Unknown event id → the same generic 404.
    expect((await checkin(webB, 'evt_inexistente', t.code)).status).toBe(404);

    // Not logged in / participant: never reaches the check-in.
    const visitor = new WebClient();
    expect((await checkin(visitor, eventId, t.code)).status).not.toBe(200);
    const participant = await loginAs('participant');
    expect((await checkin(participant, eventId, t.code)).status).not.toBe(200);
    expect((await apiTicket(t.ticketId)).checkedIn).toBe(false);
  });

  it('C-F06-02: confirmed, unused ticket of a cancelled event → event cancelled (form still shown)', async () => {
    const web = await loginAs('orgA');
    const eventId = await insertEvent({ organizer: 'orgA' });
    const t = await buyConfirmed(eventId);
    const pending = await buy(eventId, CARDS.approveSlow);
    // F07 is not on this branch: cancel the event straight in the database.
    await db.query(
      `UPDATE events SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`,
      [eventId],
    );

    const page = await web.get(`/organizer/events/${eventId}`);
    expect(hasTestId(page.html, 'checkin-form')).toBe(true);

    expect(await checkinMessage(web, eventId, t.code)).toBe(CANCELLED);
    expect(await checkinMessage(web, eventId, pending.code)).toBe(CANCELLED);
    expect(await checkinMessage(web, eventId, 'ZZZZZZZZ')).toBe(INVALID);
    expect((await dbTicket(t.ticketId)).checked_in).toBe(false);
  });
});
