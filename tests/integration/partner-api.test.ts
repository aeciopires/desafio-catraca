// F05: partner API fixed contract over HTTP (C-F05-01..06, 08, 09).
import { describe, expect, it } from 'vitest';
import { purchaseTicket } from '../../src/domain/purchase.ts';
import {
  BASE_URL,
  CARDS,
  WebClient,
  db,
  futureLocal,
  insertEvent,
  loginAs,
  partner,
  scaled,
  uniqueEmail,
  uniqueName,
  waitFor,
} from './helpers.ts';

const EVENTS = '/api/partner/events';
const purchasePath = (eventId: string) => `/api/partner/events/${eventId}/purchases`;
const ticketPath = (ticketId: string) => `/api/partner/tickets/${ticketId}`;

interface ApiEvent {
  id: string;
  name: string;
  startsAt: string;
  priceCents: number;
  availableSeats: number;
}

function validBody(cardNumber: string = CARDS.approveSlow) {
  return { buyerEmail: uniqueEmail('api'), cardNumber };
}

async function listEvents(): Promise<ApiEvent[]> {
  const res = await partner('GET', EVENTS);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.json)).toBe(true);
  return res.json as ApiEvent[];
}

async function apiEvent(id: string): Promise<ApiEvent | undefined> {
  return (await listEvents()).find((e) => e.id === id);
}

/** Creates a draft event through the organizer UI (F02) and returns its id. */
async function createViaUi(
  web: WebClient,
  form: { name: string; startsAt: string; capacity: number; price: string },
): Promise<string> {
  const res = await web.post('/organizer/events', { ...form, venue: 'Porão do Teste' });
  expect(res.status).toBe(303);
  const m = /^\/organizer\/events\/(evt_[a-z0-9]+)$/.exec(res.location ?? '');
  expect(m).not.toBeNull();
  return m![1]!;
}

async function publishViaUi(web: WebClient, id: string): Promise<void> {
  const res = await web.post(`/organizer/events/${id}/publish`);
  expect(res.status).toBe(303);
}

async function ticketRow(id: string) {
  const { rows } = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
  return rows[0];
}

describe('F05 partner API', () => {
  it('C-F05-01/08: lists only published events with the contract fields and offset dates', async () => {
    const web = await loginAs('orgA');
    const name = uniqueName('Jazz F05');
    const startsAt = futureLocal(30, 21);
    const id = await createViaUi(web, { name, startsAt, capacity: 2, price: '100,00' });

    // Draft (F02) is not listed.
    expect(await apiEvent(id)).toBeUndefined();

    await publishViaUi(web, id);
    const listed = await apiEvent(id);
    expect(listed).toEqual({
      id,
      name,
      startsAt: `${startsAt}:00-03:00`,
      priceCents: 10000,
      availableSeats: 2,
    });
    expect(Object.keys(listed!).sort()).toEqual(
      ['availableSeats', 'id', 'name', 'priceCents', 'startsAt'].sort(),
    );

    // Cancelled events are not listed either.
    const cancelled = await insertEvent({ status: 'cancelled' });
    const draft = await insertEvent({ status: 'draft' });
    const ids = (await listEvents()).map((e) => e.id);
    expect(ids).not.toContain(cancelled);
    expect(ids).not.toContain(draft);
    for (const e of await listEvents()) {
      expect(e.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
    }
  });

  it('C-F05-02: purchase returns 202 with exactly ticketId, code and status pending', async () => {
    const eventId = await insertEvent({ capacity: 3 });
    const started = Date.now();
    const res = await partner('POST', purchasePath(eventId), validBody(CARDS.approveSlow));
    expect(Date.now() - started).toBeLessThan(2000); // never waits for the gateway (R09)
    expect(res.status).toBe(202);
    expect(Object.keys(res.json).sort()).toEqual(['code', 'status', 'ticketId']);
    expect(res.json.status).toBe('pending');
    expect(res.json.ticketId).toMatch(/^tkt_/);
    expect(res.json.code).toMatch(/^[A-Z0-9]{8}$/);

    const row = await ticketRow(res.json.ticketId);
    expect(row.channel).toBe('partner');
    expect(row.partner_id).not.toBeNull();
    expect(row.buyer_user_id).toBeNull();
    expect(row.code).toBe(res.json.code);
    expect((await apiEvent(eventId))!.availableSeats).toBe(2);
  });

  it('C-F05-03: purchase errors follow the order body → event → seats', async () => {
    const missing = 'evt_does_not_exist';
    const invalidBodies: unknown[] = [
      { cardNumber: '123' },
      '{"buyerEmail":',
      { buyerEmail: 'x@', cardNumber: CARDS.approveFast },
      { buyerEmail: 'ana@example.com' },
      { cardNumber: CARDS.approveFast },
      { buyerEmail: 'ana@example.com', cardNumber: '400000000000000' },
      { buyerEmail: 'ana@example.com', cardNumber: '40000000000000011' },
      { buyerEmail: 'ana@example.com', cardNumber: '400000000000000a' },
      { buyerEmail: 'ana@example.com', cardNumber: 4000000000000001 },
      { buyerEmail: 123, cardNumber: CARDS.approveFast },
      '[]',
      '"text"',
      'null',
    ];
    for (const body of invalidBodies) {
      const res = await partner('POST', purchasePath(missing), body);
      expect(res, `body ${JSON.stringify(body)}`).toEqual({
        status: 422,
        json: { error: 'invalid_request' },
      });
    }

    // No body at all / non-JSON content types are also invalid requests (never 400/415/500).
    const headers = { 'x-api-key': 'catraca-partner-key-dev' };
    for (const init of [
      { headers },
      { headers: { ...headers, 'content-type': 'application/json' } },
      { headers: { ...headers, 'content-type': 'text/plain' }, body: 'hello' },
      {
        headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'buyerEmail=a%40b.co&cardNumber=4000000000000001',
      },
    ]) {
      const res = await fetch(`${BASE_URL}${purchasePath(missing)}`, { method: 'POST', ...init });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'invalid_request' });
    }

    const notAvailable = { status: 404, json: { error: 'event_not_available' } };
    expect(await partner('POST', purchasePath(missing), validBody())).toEqual(notAvailable);
    const draft = await insertEvent({ status: 'draft' });
    expect(await partner('POST', purchasePath(draft), validBody())).toEqual(notAvailable);
    const cancelled = await insertEvent({ status: 'cancelled' });
    expect(await partner('POST', purchasePath(cancelled), validBody())).toEqual(notAvailable);

    const full = await insertEvent({ capacity: 1 });
    expect((await partner('POST', purchasePath(full), validBody())).status).toBe(202);
    expect(await partner('POST', purchasePath(full), validBody())).toEqual({
      status: 409,
      json: { error: 'sold_out' },
    });
    // Invalid body still wins over sold out.
    expect(await partner('POST', purchasePath(full), { cardNumber: '123' })).toEqual({
      status: 422,
      json: { error: 'invalid_request' },
    });
    // Rejected purchases never create tickets.
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tickets WHERE event_id = ANY($1)',
      [[draft, cancelled, full]],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('C-F05-04: the three routes answer 401 without the header or with a wrong key', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const ticket = await partner('POST', purchasePath(eventId), validBody());
    expect(ticket.status).toBe(202);
    const unauthorized = { status: 401, json: { error: 'unauthorized' } };
    const calls: Array<[string, string, unknown]> = [
      ['GET', EVENTS, undefined],
      ['POST', purchasePath(eventId), validBody()],
      ['GET', ticketPath(ticket.json.ticketId), undefined],
    ];
    let n = 0;
    for (const key of [null, 'wrong-key']) {
      for (const [method, path, body] of calls) {
        expect(await partner(method, path, body, key), `${method} ${path} key=${key}`).toEqual(
          unauthorized,
        );
        n++;
      }
      // Even with an invalid body, the key is checked first.
      expect(await partner('POST', purchasePath(eventId), '{broken', key)).toEqual(unauthorized);
      expect(await partner('POST', purchasePath('evt_missing'), { cardNumber: '1' }, key)).toEqual(
        unauthorized,
      );
    }
    expect(n).toBe(6);
    expect(await partner('GET', EVENTS, undefined, '')).toEqual(unauthorized);
    // Unauthorized purchases created nothing: only the first ticket occupies a seat.
    expect((await apiEvent(eventId))!.availableSeats).toBe(4);
  });

  it('C-F05-05: ticket lookup for partner and web tickets; unknown → 404', async () => {
    const eventId = await insertEvent({ capacity: 5 });
    const bought = await partner('POST', purchasePath(eventId), validBody(CARDS.approveFast));
    expect(bought.status).toBe(202);
    const first = await partner('GET', ticketPath(bought.json.ticketId));
    expect(first.status).toBe(200);
    expect(Object.keys(first.json).sort()).toEqual(
      ['checkedIn', 'code', 'eventId', 'status', 'ticketId'].sort(),
    );
    expect(first.json).toMatchObject({
      ticketId: bought.json.ticketId,
      code: bought.json.code,
      eventId,
      checkedIn: false,
    });
    expect(['pending', 'confirmed']).toContain(first.json.status);
    await waitFor(
      async () =>
        (await partner('GET', ticketPath(bought.json.ticketId))).json.status === 'confirmed',
      scaled(5000),
    );

    // A ticket sold through another channel (web/showcase) is visible too.
    const webTicket = await purchaseTicket({
      eventId,
      channel: 'web',
      buyerEmail: uniqueEmail('web'),
      cardNumber: CARDS.declineFast,
    });
    const web = await partner('GET', ticketPath(webTicket.id));
    expect(web.status).toBe(200);
    expect(web.json).toMatchObject({
      ticketId: webTicket.id,
      code: webTicket.code,
      eventId,
      checkedIn: false,
    });
    await waitFor(
      async () => (await partner('GET', ticketPath(webTicket.id))).json.status === 'declined',
      scaled(5000),
    );

    expect(await partner('GET', ticketPath('tkt_inexistente'))).toEqual({
      status: 404,
      json: { error: 'ticket_not_found' },
    });
  });

  it('C-F05-06: Swagger UI and the OpenAPI document', async () => {
    const ui = await fetch(`${BASE_URL}/api/docs`);
    expect(ui.status).toBe(200);
    expect(ui.headers.get('content-type')).toContain('text/html');
    expect(await ui.text()).toMatch(/swagger/i);

    const res = await fetch(`${BASE_URL}/api/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as any;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('Catraca — API de parceiros');
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        '/api/partner/events',
        '/api/partner/events/{eventId}/purchases',
        '/api/partner/tickets/{ticketId}',
      ].sort(),
    );
    expect(doc.components.securitySchemes.ApiKeyAuth).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-Api-Key',
    });
    const purchase = doc.paths['/api/partner/events/{eventId}/purchases'].post;
    expect(Object.keys(purchase.responses).sort()).toEqual(['202', '401', '404', '409', '422']);
    expect(Object.keys(doc.paths['/api/partner/events'].get.responses).sort()).toEqual([
      '200',
      '401',
    ]);
    expect(Object.keys(doc.paths['/api/partner/tickets/{ticketId}'].get.responses).sort()).toEqual([
      '200',
      '401',
      '404',
    ]);
    const text = JSON.stringify(doc);
    for (const sample of ['evt_8f2k', 'tkt_51xq', 'K7Q2M9XA']) expect(text).toContain(sample);
  });

  it('C-F05-09: an API purchase takes the last seat (availableSeats 0, then sold_out)', async () => {
    const eventId = await insertEvent({ capacity: 2 });
    expect(
      (await partner('POST', purchasePath(eventId), validBody(CARDS.approveFast))).status,
    ).toBe(202);
    expect((await apiEvent(eventId))!.availableSeats).toBe(1);
    const last = await partner('POST', purchasePath(eventId), validBody(CARDS.declineSlow));
    expect(last.status).toBe(202);
    expect((await apiEvent(eventId))!.availableSeats).toBe(0);
    // The showcase "Ingressos esgotados" assertion is covered on the F04 branch.
    expect(await partner('POST', purchasePath(eventId), validBody(CARDS.approveFast))).toEqual({
      status: 409,
      json: { error: 'sold_out' },
    });
    // When the slow decline lands, the seat is freed again (R06).
    await waitFor(
      async () => (await partner('GET', ticketPath(last.json.ticketId))).json.status === 'declined',
      scaled(40_000),
    );
    expect((await apiEvent(eventId))!.availableSeats).toBe(1);
  });
});
