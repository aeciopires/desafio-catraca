// F04: showcase, event page with purchase and "Meus ingressos" (C-F04-01..08).
// The "worker" service of the stack applies gateway decisions (GATEWAY_DELAY_SCALE=0.1 in tests).
import { describe, expect, it } from 'vitest';
import { purchaseTicket } from '../../src/domain/purchase.ts';
import {
  CARDS,
  WebClient,
  db,
  futureLocal,
  hasTestId,
  insertEvent,
  loginAs,
  scaled,
  testId,
  testIdAll,
  uniqueEmail,
  uniqueName,
  waitFor,
} from './helpers.ts';

/** Creates an event through the organizer UI (F02) and returns its id. */
async function createViaUi(
  organizer: WebClient,
  overrides: Record<string, string | number> = {},
): Promise<{ id: string; name: string }> {
  const form = {
    name: uniqueName('Show F04'),
    startsAt: futureLocal(30),
    venue: 'Bar do Zé',
    capacity: 3,
    price: '80,00',
    ...overrides,
  };
  const res = await organizer.post('/organizer/events', form);
  expect(res.status).toBe(303);
  const m = /^\/organizer\/events\/(evt_[a-z0-9]+)$/.exec(res.location ?? '');
  expect(m).not.toBeNull();
  return { id: m![1]!, name: String(form.name) };
}

/** Returns the inner HTML of the showcase card of an event, or null if it is not listed. */
function showcaseCard(html: string, eventId: string): string | null {
  const re = new RegExp(
    `<article[^>]*data-testid="showcase-event"[^>]*data-event-id="${eventId}"[^>]*>([\\s\\S]*?)</article>`,
  );
  return re.exec(html)?.[1] ?? null;
}

async function newParticipant(prefix = 'buyer'): Promise<{ web: WebClient; email: string }> {
  const web = new WebClient();
  const email = uniqueEmail(prefix);
  await web.signup(`Participante ${prefix}`, email);
  return { web, email };
}

async function eventName(eventId: string): Promise<string> {
  const { rows } = await db.query<{ name: string }>('SELECT name FROM events WHERE id = $1', [
    eventId,
  ]);
  return rows[0]!.name;
}

describe('F04 showcase', () => {
  it('C-F04-01 / C-F04-05: drafts stay out of the showcase; published events appear with seats', async () => {
    const organizer = await loginAs('orgA');
    const { id, name } = await createViaUi(organizer, { capacity: 7 });

    const visitor = new WebClient();
    const before = await visitor.get('/');
    expect(before.status).toBe(200);
    expect(before.html).not.toContain(name);
    expect(showcaseCard(before.html, id)).toBeNull();
    expect((await visitor.get(`/events/${id}`)).status).toBe(404);

    const pub = await organizer.post(`/organizer/events/${id}/publish`);
    expect(pub.status).toBe(303);

    const after = await visitor.get('/');
    const card = showcaseCard(after.html, id);
    expect(card).not.toBeNull();
    expect(card).toContain(name);
    expect(testId(card!, 'available-seats')).toBe('7');
    expect(testId(card!, 'event-venue')).toBe('Bar do Zé');
    expect(testId(card!, 'event-price')).toContain('80,00');
    expect(card).toContain(`href="/events/${id}"`);

    const page = await visitor.get(`/events/${id}`);
    expect(page.status).toBe(200);
    expect(testId(page.html, 'event-name')).toBe(name);
  });

  it('returns 404 for unknown and cancelled events', async () => {
    const visitor = new WebClient();
    expect((await visitor.get('/events/evt_doesnotexist')).status).toBe(404);
    const cancelled = await insertEvent({ status: 'cancelled' });
    expect((await visitor.get(`/events/${cancelled}`)).status).toBe(404);
    const home = await visitor.get('/');
    expect(showcaseCard(home.html, cancelled)).toBeNull();
  });

  it('C-F04-02 / C-F04-06: participant buys from the showcase; pending then confirmed', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const name = await eventName(eventId);
    const { web, email } = await newParticipant('compra');

    const page = await web.get(`/events/${eventId}`);
    expect(hasTestId(page.html, 'purchase-form')).toBe(true);
    expect(page.html).toContain('name="cardNumber"');
    expect(page.html).toContain('16 dígitos');

    const res = await web.post(`/events/${eventId}/purchase`, { cardNumber: CARDS.approveFast });
    expect(res.status).toBe(303);
    expect(res.location).toBe('/me/tickets?ok=purchased');

    const list = await web.get(res.location!);
    expect(list.status).toBe(200);
    expect(testId(list.html, 'flash')).toBe(
      'Compra registrada! Status pendente até a resposta do pagamento.',
    );
    expect(list.html).toContain('recarregue a página para ver o status atualizado');
    expect(testIdAll(list.html, 'ticket-row')).toHaveLength(1);
    expect(testId(list.html, 'ticket-event')).toBe(name);
    expect(testId(list.html, 'ticket-status')).toBe('pendente');
    const code = testId(list.html, 'ticket-code')!;
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    // C-F04-06: the ticket came through the F03 core (web channel, buyer, payment job).
    const { rows } = await db.query(
      `SELECT t.channel, t.buyer_user_id, t.buyer_email, u.id AS user_id,
              (SELECT count(*) FROM payment_jobs p WHERE p.ticket_id = t.id) AS jobs
         FROM tickets t JOIN users u ON u.email = $2
        WHERE t.code = $1`,
      [code, email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('web');
    expect(rows[0].buyer_user_id).toBe(rows[0].user_id);
    expect(rows[0].buyer_email).toBe(email);
    expect(rows[0].jobs).toBe(1);

    // Confirmation applied by the worker; visible after a reload.
    const confirmed = await waitFor(async () => {
      const again = await web.get('/me/tickets');
      return testId(again.html, 'ticket-status') === 'confirmado' ? again : null;
    }, scaled(5000));
    expect(testId(confirmed.html, 'ticket-code')).toBe(code);
    expect(testId(confirmed.html, 'flash')).toBeNull();
  });

  it('C-F04-03: sold-out event shows "Ingressos esgotados" instead of the form; POST -> 409', async () => {
    const eventId = await insertEvent({ capacity: 1 });
    const first = await newParticipant('first');
    const buy = await first.web.post(`/events/${eventId}/purchase`, {
      cardNumber: CARDS.approveSlow,
    });
    expect(buy.status).toBe(303);

    const { web } = await newParticipant('late');
    const page = await web.get(`/events/${eventId}`);
    expect(page.status).toBe(200);
    expect(testId(page.html, 'sold-out')).toBe('Ingressos esgotados');
    expect(hasTestId(page.html, 'purchase-form')).toBe(false);

    const home = await web.get('/');
    expect(testId(showcaseCard(home.html, eventId)!, 'available-seats')).toBe('0');

    const res = await web.post(`/events/${eventId}/purchase`, { cardNumber: CARDS.approveFast });
    expect(res.status).toBe(409);
    expect(testId(res.html, 'sold-out')).toBe('Ingressos esgotados');
    expect(hasTestId(res.html, 'purchase-form')).toBe(false);
    expect(testIdAll((await web.get('/me/tickets')).html, 'ticket-row')).toHaveLength(0);
  });

  it('C-F04-04: visitor is redirected to login; invalid card -> 422 and no ticket', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const visitor = new WebClient();
    const page = await visitor.get(`/events/${eventId}`);
    expect(hasTestId(page.html, 'purchase-form')).toBe(false);
    expect(testId(page.html, 'login-to-buy')).toBe('Entre para comprar');
    expect(page.html).toContain(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);

    const anon = await visitor.post(`/events/${eventId}/purchase`, {
      cardNumber: CARDS.approveFast,
    });
    expect(anon.status).toBe(302);
    expect(anon.location).toMatch(/^\/login\?next=/);
    expect(decodeURIComponent(anon.location!)).toContain(`/events/${eventId}`);
    expect((await visitor.get('/me/tickets')).status).toBe(302);

    const { web } = await newParticipant('card');
    const res = await web.post(`/events/${eventId}/purchase`, { cardNumber: '123' });
    expect(res.status).toBe(422);
    expect(testId(res.html, 'form-error')).toBe('O número do cartão deve ter 16 dígitos');
    expect(hasTestId(res.html, 'purchase-form')).toBe(true);
    expect(testIdAll((await web.get('/me/tickets')).html, 'ticket-row')).toHaveLength(0);

    const { rows } = await db.query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [
      eventId,
    ]);
    expect(rows[0].n).toBe(0);
  });

  it('organizer sees a notice instead of the purchase form and cannot buy', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const organizer = await loginAs('orgB');
    const page = await organizer.get(`/events/${eventId}`);
    expect(testId(page.html, 'organizer-notice')).toBe('Apenas participantes compram ingressos');
    expect(hasTestId(page.html, 'purchase-form')).toBe(false);
    const res = await organizer.post(`/events/${eventId}/purchase`, {
      cardNumber: CARDS.approveFast,
    });
    expect(res.status).toBe(403);
    expect((await organizer.get('/me/tickets')).status).toBe(403);
  });

  it('purchase on a draft event -> 404', async () => {
    const eventId = await insertEvent({ status: 'draft' });
    const { web } = await newParticipant('draft');
    const res = await web.post(`/events/${eventId}/purchase`, { cardNumber: CARDS.approveFast });
    expect(res.status).toBe(404);
  });

  it('C-F04-07: a partner purchase occupies the shared seat; a decline frees it', async () => {
    const eventId = await insertEvent({ capacity: 1 });
    const { web } = await newParticipant('shared');

    const ticket = await purchaseTicket({
      eventId,
      channel: 'partner',
      buyerEmail: uniqueEmail('partner-buyer'),
      cardNumber: CARDS.declineFast,
    });
    expect(ticket.status).toBe('pending');

    const soldOut = await web.get(`/events/${eventId}`);
    expect(testId(soldOut.html, 'sold-out')).toBe('Ingressos esgotados');
    expect(hasTestId(soldOut.html, 'purchase-form')).toBe(false);

    const reopened = await waitFor(async () => {
      const page = await web.get(`/events/${eventId}`);
      return hasTestId(page.html, 'purchase-form') ? page : null;
    }, scaled(5000));
    expect(hasTestId(reopened.html, 'sold-out')).toBe(false);
    expect(testId(reopened.html, 'available-seats')).toBe('1');
  });

  it('C-F04-08: each participant sees only their own tickets, newest first', async () => {
    const eventA = await insertEvent({ capacity: 5 });
    const eventB = await insertEvent({ capacity: 5 });
    const nameA = await eventName(eventA);
    const nameB = await eventName(eventB);
    const alice = await newParticipant('alice');
    const bob = await newParticipant('bob');

    expect(
      (await alice.web.post(`/events/${eventA}/purchase`, { cardNumber: CARDS.approveSlow }))
        .status,
    ).toBe(303);
    expect(
      (await alice.web.post(`/events/${eventB}/purchase`, { cardNumber: CARDS.approveSlow }))
        .status,
    ).toBe(303);
    expect(
      (await bob.web.post(`/events/${eventA}/purchase`, { cardNumber: CARDS.declineSlow })).status,
    ).toBe(303);

    const aliceList = await alice.web.get('/me/tickets');
    expect(testIdAll(aliceList.html, 'ticket-event')).toEqual([nameB, nameA]);
    const aliceCodes = testIdAll(aliceList.html, 'ticket-code');

    const bobList = await bob.web.get('/me/tickets');
    expect(testIdAll(bobList.html, 'ticket-event')).toEqual([nameA]);
    const bobCodes = testIdAll(bobList.html, 'ticket-code');
    expect(bobCodes).toHaveLength(1);
    expect(aliceCodes).not.toContain(bobCodes[0]);
  });
});
