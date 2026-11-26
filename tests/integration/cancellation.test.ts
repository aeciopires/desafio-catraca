// F07: event cancellation (C-F07-01..05, 07) over HTTP, against the live stack and the real
// partner API / payment worker. C-F07-06 (check-in of a refunded ticket) is exercised by F06's
// tests and by the evaluator flow once both features are on main.
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  WebClient,
  db,
  futureLocal,
  hasTestId,
  insertEvent,
  loginAs,
  partner,
  scaled,
  testId,
  uniqueEmail,
  uniqueName,
  waitFor,
} from './helpers.ts';

const managePath = (id: string) => `/organizer/events/${id}`;
const cancelPath = (id: string) => `/organizer/events/${id}/cancel`;
const purchasePath = (id: string) => `/api/partner/events/${id}/purchases`;

async function createAndPublish(
  web: WebClient,
  opts: { capacity?: number; price?: string; publish?: boolean } = {},
): Promise<string> {
  const res = await web.post('/organizer/events', {
    name: uniqueName('E3 Cancel'),
    startsAt: futureLocal(30),
    venue: 'Porão do Teste',
    capacity: opts.capacity ?? 5,
    price: opts.price ?? '50,00',
  });
  expect(res.status).toBe(303);
  const id = /\/organizer\/events\/(evt_[A-Za-z0-9_]+)$/.exec(res.location ?? '')![1]!;
  if (opts.publish !== false) {
    expect((await web.post(`/organizer/events/${id}/publish`)).status).toBe(303);
  }
  return id;
}

async function buy(eventId: string, card: string): Promise<{ ticketId: string; code: string }> {
  const res = await partner('POST', purchasePath(eventId), {
    buyerEmail: uniqueEmail('cancel'),
    cardNumber: card,
  });
  expect(res.status).toBe(202);
  return { ticketId: res.json.ticketId, code: res.json.code };
}

async function ticketStatus(ticketId: string): Promise<string> {
  const res = await partner('GET', `/api/partner/tickets/${ticketId}`);
  expect(res.status).toBe(200);
  return res.json.status as string;
}

async function eventStatus(eventId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [
    eventId,
  ]);
  return rows[0]!.status;
}

describe('F07 event cancellation', () => {
  it('C-F07-01..04: cancels a published event; tickets change in ≤ 10 s; late gateway answer is ignored', async () => {
    const web = await loginAs('orgA');
    const e3 = await createAndPublish(web);

    // T5: slow approval (decision due after 30–39 s scaled); T6: fast approval.
    const t5At = Date.now();
    const t5 = await buy(e3, CARDS.approveSlow);
    const t6 = await buy(e3, CARDS.approveFast);
    await waitFor(async () => (await ticketStatus(t6.ticketId)) === 'confirmed', scaled(5000));
    expect(await ticketStatus(t5.ticketId)).toBe('pending');

    // C-F07-01: cancel → 303 with the flash; page shows Cancelado + notice.
    const cancelAt = Date.now();
    const res = await web.post(cancelPath(e3));
    expect(res.status).toBe(303);
    expect(res.location).toBe(`${managePath(e3)}?ok=cancelled`);
    // Cancellation must have happened before T5's gateway decision (≥ 30 s scaled).
    expect(cancelAt - t5At).toBeLessThan(30_000 * Number(process.env.GATEWAY_DELAY_SCALE ?? '1'));

    const page = await web.get(res.location!);
    expect(page.status).toBe(200);
    expect(testId(page.html, 'event-status')).toBe('Cancelado');
    expect(testId(page.html, 'flash')).toBe('Evento cancelado.');
    expect(testId(page.html, 'event-cancelled')).toMatch(
      /^Evento cancelado em \d{2}\/\d{2}\/\d{4}.*\. Esta ação é irreversível\.$/,
    );

    // C-F07-03: within 10 s, T6 refunded and T5 cancelled.
    await waitFor(
      async () =>
        (await ticketStatus(t6.ticketId)) === 'refunded' &&
        (await ticketStatus(t5.ticketId)) === 'cancelled',
      10_000,
    );

    // C-F07-02: gone from the showcase and the partner API; API purchase refused.
    const showcase = await new WebClient().get('/');
    expect(showcase.html).not.toContain(`data-event-id="${e3}"`);
    const list = await partner('GET', '/api/partner/events');
    expect((list.json as { id: string }[]).some((e) => e.id === e3)).toBe(false);
    const refused = await partner('POST', purchasePath(e3), {
      buyerEmail: uniqueEmail('late'),
      cardNumber: CARDS.approveFast,
    });
    expect(refused.status).toBe(404);
    expect(refused.json).toEqual({ error: 'event_not_available' });

    // Cancelling again → 409 with the form error.
    const again = await web.post(cancelPath(e3));
    expect(again.status).toBe(409);
    expect(testId(again.html, 'form-error')).toBe('Só eventos publicados podem ser cancelados');

    // C-F07-04: after T5's due time the late approval did not change anything.
    const remaining = scaled(40_000) - (Date.now() - t5At);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    expect(await ticketStatus(t5.ticketId)).toBe('cancelled');
    expect(await ticketStatus(t6.ticketId)).toBe('refunded');
    const { rows: jobs } = await db.query<{ state: string }>(
      'SELECT state FROM payment_jobs WHERE ticket_id = $1',
      [t5.ticketId],
    );
    expect(['obsolete', 'done']).toContain(jobs[0]!.state);
  });

  it('C-F07-01: a draft cannot be cancelled (409) and the page explains why', async () => {
    const web = await loginAs('orgA');
    const draft = await createAndPublish(web, { publish: false });
    const page = await web.get(managePath(draft));
    expect(hasTestId(page.html, 'cancel-button')).toBe(false);

    const res = await web.post(cancelPath(draft));
    expect(res.status).toBe(409);
    expect(testId(res.html, 'form-error')).toBe('Só eventos publicados podem ser cancelados');
    expect(await eventStatus(draft)).toBe('draft');
  });

  it('C-F07-05: a cancelled event cannot be edited, republished nor cancelled again from the page', async () => {
    const web = await loginAs('orgA');
    const id = await createAndPublish(web);
    const before = await web.get(managePath(id));
    expect(hasTestId(before.html, 'cancel-button')).toBe(true);
    expect((await web.post(cancelPath(id))).status).toBe(303);

    const page = await web.get(managePath(id));
    expect(hasTestId(page.html, 'edit-form')).toBe(false);
    expect(hasTestId(page.html, 'publish-button')).toBe(false);
    expect(hasTestId(page.html, 'cancel-button')).toBe(false);
    expect(hasTestId(page.html, 'event-cancelled')).toBe(true);

    const edit = await web.post(managePath(id), {
      name: 'Novo nome',
      startsAt: futureLocal(40),
      venue: 'Outro lugar',
      capacity: 10,
      price: '10,00',
    });
    expect(edit.status).toBe(422);
    expect(testId(edit.html, 'form-error')).toBe('Evento cancelado não pode ser editado');

    await web.post(`/organizer/events/${id}/publish`);
    expect(await eventStatus(id)).toBe('cancelled');
  });

  it('C-F07-05: another organizer cannot cancel (404, event stays published)', async () => {
    const webA = await loginAs('orgA');
    const id = await createAndPublish(webA);
    const webB = await loginAs('orgB');
    const res = await webB.post(cancelPath(id));
    expect(res.status).toBe(404);
    expect(res.html).not.toContain(id.slice(4));
    expect(await eventStatus(id)).toBe('published');

    // Participant and visitor never reach the route.
    const participant = await loginAs('participant');
    expect((await participant.post(cancelPath(id))).status).toBeGreaterThanOrEqual(300);
    expect((await new WebClient().post(cancelPath(id))).status).toBeGreaterThanOrEqual(300);
    expect(await eventStatus(id)).toBe('published');
  });

  it('C-F07-07: cancelling during a burst of purchases leaves no pending/confirmed ticket', async () => {
    const id = await insertEvent({ organizer: 'orgA', capacity: 50 });
    const web = await loginAs('orgA');
    const cards = [CARDS.approveFast, CARDS.approveSlow, CARDS.declineSlow];
    const burst = Array.from({ length: 30 }, (_, i) =>
      partner('POST', purchasePath(id), {
        buyerEmail: uniqueEmail(`burst${i}`),
        cardNumber: cards[i % cards.length],
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    const cancel = await web.post(cancelPath(id));
    expect(cancel.status).toBe(303);
    const results = await Promise.all(burst);
    for (const r of results) {
      if (r.status === 202) continue;
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ error: 'event_not_available' });
    }

    const live = async () => {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')",
        [id],
      );
      return rows[0]!.n;
    };
    expect(await live()).toBe(0);
    // Even after every payment decision is due, nothing comes back.
    await new Promise((r) => setTimeout(r, scaled(40_000)));
    expect(await live()).toBe(0);
    const { rows: jobs } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payment_jobs j JOIN tickets t ON t.id = j.ticket_id
        WHERE t.event_id = $1 AND j.state = 'scheduled'`,
      [id],
    );
    expect(jobs[0]!.n).toBe(0);
  });
});
