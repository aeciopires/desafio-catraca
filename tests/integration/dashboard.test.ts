// F08: event dashboard (C-F08-01..07) over HTTP, against the live stack, the real web UI, the
// partner API and the payment worker. Every number is read from the management page.
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  WebClient,
  futureLocal,
  hasTestId,
  loginAs,
  partner,
  scaled,
  testId,
  uniqueEmail,
  uniqueName,
  waitFor,
} from './helpers.ts';

const managePath = (id: string) => `/organizer/events/${id}`;
const purchasePath = (id: string) => `/api/partner/events/${id}/purchases`;

const DASH_IDS = {
  confirmed: 'dash-confirmed',
  pending: 'dash-pending',
  checkins: 'dash-checkins',
  available: 'dash-available',
  revenue: 'dash-revenue',
  refunded: 'dash-refunded',
} as const;

type Dash = Record<keyof typeof DASH_IDS, string>;

const LABELS = [
  'Confirmados',
  'Pendentes',
  'Check-ins',
  'Vagas disponíveis',
  'Receita',
  'Estornados',
];

/** Reads the six dashboard values from the management page. */
async function dashboard(web: WebClient, eventId: string): Promise<Dash> {
  const page = await web.get(managePath(eventId));
  expect(page.status).toBe(200);
  const out = {} as Dash;
  for (const [key, id] of Object.entries(DASH_IDS)) {
    out[key as keyof Dash] = testId(page.html, id) ?? '<missing>';
  }
  return out;
}

const dash = (
  confirmed: number,
  pending: number,
  checkins: number,
  available: number,
  revenue: string,
  refunded: number,
): Dash => ({
  confirmed: String(confirmed),
  pending: String(pending),
  checkins: String(checkins),
  available: String(available),
  revenue,
  refunded: String(refunded),
});

/** Polls the dashboard until it equals `expected` (returns the last read on timeout via expect). */
async function waitDashboard(
  web: WebClient,
  eventId: string,
  expected: Partial<Dash>,
  timeoutMs: number,
): Promise<Dash> {
  let last: Dash | null = null;
  try {
    return await waitFor(async () => {
      last = await dashboard(web, eventId);
      return Object.entries(expected).every(([k, v]) => last![k as keyof Dash] === v) && last;
    }, timeoutMs);
  } catch {
    expect(last).toMatchObject(expected);
    throw new Error('unreachable');
  }
}

const FORM = { startsAt: futureLocal(30), venue: 'Bar do Painel' };

async function createAndPublish(
  web: WebClient,
  opts: { name?: string; capacity: number; price: string },
): Promise<string> {
  const res = await web.post('/organizer/events', {
    name: opts.name ?? uniqueName('Painel'),
    startsAt: FORM.startsAt,
    venue: FORM.venue,
    capacity: opts.capacity,
    price: opts.price,
  });
  expect(res.status).toBe(303);
  const id = /\/organizer\/events\/(evt_[A-Za-z0-9_]+)$/.exec(res.location ?? '')![1]!;
  expect((await web.post(`/organizer/events/${id}/publish`)).status).toBe(303);
  return id;
}

async function buy(eventId: string, card: string): Promise<{ ticketId: string; code: string }> {
  const res = await partner('POST', purchasePath(eventId), {
    buyerEmail: uniqueEmail('dash'),
    cardNumber: card,
  });
  expect(res.status).toBe(202);
  return { ticketId: res.json.ticketId, code: res.json.code };
}

async function ticketStatus(ticketId: string): Promise<string> {
  const res = await partner('GET', `/api/partner/tickets/${ticketId}`);
  return res.json.status as string;
}

async function waitStatus(ticketId: string, status: string, timeoutMs: number): Promise<void> {
  await waitFor(async () => (await ticketStatus(ticketId)) === status, timeoutMs);
}

describe('F08 event dashboard', () => {
  it('C-F08-01..03: web + API sales, current price per purchase, check-ins (steps 9-10)', async () => {
    const web = await loginAs('orgA');
    const name = uniqueName('E1 Painel');
    const e1 = await createAndPublish(web, { name, capacity: 2, price: '100,00' });

    // C-F08-01: six numbers with their labels, at the top of the sections.
    const page = await web.get(managePath(e1));
    for (const id of Object.values(DASH_IDS)) expect(hasTestId(page.html, id)).toBe(true);
    for (const label of LABELS) expect(page.html).toContain(label);
    expect(await dashboard(web, e1)).toEqual(dash(0, 0, 0, 2, 'R$ 0,00', 0));

    // One web purchase (new participant) and one API purchase, both approved; one declined.
    const participant = new WebClient();
    await participant.signup('Participante Painel', uniqueEmail('painel'));
    const webBuy = await participant.post(`/events/${e1}/purchase`, {
      cardNumber: CARDS.approveFast,
    });
    expect(webBuy.status).toBe(303);
    const declined = await buy(e1, CARDS.declineFast);
    await waitStatus(declined.ticketId, 'declined', scaled(5000));
    const t3 = await buy(e1, CARDS.approveFast);
    await waitStatus(t3.ticketId, 'confirmed', scaled(5000));
    await waitDashboard(web, e1, dash(2, 0, 0, 0, 'R$ 200,00', 0), scaled(5000));

    // Step 9: reducing capacity below occupied is rejected; price 150,00 + capacity 3 accepted.
    const rejected = await web.post(managePath(e1), {
      name,
      ...FORM,
      capacity: 1,
      price: '100,00',
    });
    expect(rejected.status).toBe(422);
    const edited = await web.post(managePath(e1), { name, ...FORM, capacity: 3, price: '150,00' });
    expect(edited.status).toBe(303);
    expect(await dashboard(web, e1)).toEqual(dash(2, 0, 0, 1, 'R$ 200,00', 0));

    // C-F08-02: T4 at the new price → R$ 100 + R$ 100 + R$ 150.
    const t4 = await buy(e1, CARDS.approveFast);
    await waitStatus(t4.ticketId, 'confirmed', scaled(5000));
    expect(await dashboard(web, e1)).toEqual(dash(3, 0, 0, 0, 'R$ 350,00', 0));

    // C-F08-03: check-in → Check-ins 1, Confirmados still 3.
    const ok = await web.post(`${managePath(e1)}/checkin`, { code: t3.code });
    expect(ok.status).toBe(200);
    expect(testId(ok.html, 'checkin-result')).toBe('Entrada liberada');
    // The check-in response page itself shows the updated dashboard.
    expect(testId(ok.html, 'dash-checkins')).toBe('1');
    const again = await web.post(`${managePath(e1)}/checkin`, { code: t3.code });
    expect(testId(again.html, 'checkin-result')).toBe('Ingresso já utilizado');
    expect(await dashboard(web, e1)).toEqual(dash(3, 0, 1, 0, 'R$ 350,00', 0));
  });

  it('C-F08-04: a pending purchase takes a seat; a declined one gives it back', async () => {
    const web = await loginAs('orgA');
    const id = await createAndPublish(web, { capacity: 4, price: '20,00' });

    const slow = await buy(id, CARDS.approveSlow); // pending for 30–39 s (scaled)
    const now = await dashboard(web, id);
    expect(now).toEqual(dash(0, 1, 0, 3, 'R$ 0,00', 0));

    const declined = await buy(id, CARDS.declineFast);
    await waitStatus(declined.ticketId, 'declined', scaled(5000));
    const afterDecline = await dashboard(web, id);
    // The declined ticket occupies nothing; only the slow one (pending or already confirmed).
    expect(Number(afterDecline.pending) + Number(afterDecline.confirmed)).toBe(1);
    expect(afterDecline.available).toBe('3');
    expect(afterDecline.refunded).toBe('0');

    await waitStatus(slow.ticketId, 'confirmed', scaled(40_000));
    expect(await dashboard(web, id)).toEqual(dash(1, 0, 0, 3, 'R$ 20,00', 0));
  });

  it('C-F08-05: after cancellation → 0/0/0/0/R$ 0,00 and Estornados 1 (step 14)', async () => {
    const web = await loginAs('orgA');
    const e3 = await createAndPublish(web, { capacity: 5, price: '50,00' });
    const t5 = await buy(e3, CARDS.approveSlow);
    const t6 = await buy(e3, CARDS.approveFast);
    await waitStatus(t6.ticketId, 'confirmed', scaled(5000));
    expect(await dashboard(web, e3)).toEqual(dash(1, 1, 0, 3, 'R$ 50,00', 0));

    expect((await web.post(`${managePath(e3)}/cancel`)).status).toBe(303);
    await waitDashboard(web, e3, dash(0, 0, 0, 0, 'R$ 0,00', 1), 10_000);
    expect(await ticketStatus(t5.ticketId)).toBe('cancelled');
  });

  it('C-F08-06: 30 concurrent API purchases on capacity 5 → Confirmados 5, Vagas 0 (step 15)', async () => {
    const web = await loginAs('orgA');
    const e4 = await createAndPublish(web, { capacity: 5, price: '10,00' });
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        partner('POST', purchasePath(e4), {
          buyerEmail: uniqueEmail(`burst${i}`),
          cardNumber: CARDS.approveFast,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 202)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(25);
    expect((await dashboard(web, e4)).available).toBe('0');
    await waitDashboard(web, e4, dash(5, 0, 0, 0, 'R$ 50,00', 0), 10_000);
  });

  it('C-F08-07: another organizer gets 404 with no dashboard data', async () => {
    const webA = await loginAs('orgA');
    const id = await createAndPublish(webA, { capacity: 2, price: '10,00' });
    const webB = await loginAs('orgB');
    const res = await webB.get(managePath(id));
    expect(res.status).toBe(404);
    expect(res.html).not.toContain('dash-');
    for (const who of ['participant'] as const) {
      const other = await loginAs(who);
      const r = await other.get(managePath(id));
      expect(r.html).not.toContain('dash-');
    }
    expect((await new WebClient().get(managePath(id))).html).not.toContain('dash-');
  });
});
