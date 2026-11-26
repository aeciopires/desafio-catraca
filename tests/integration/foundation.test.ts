// F01: organizer area guard (C-F01-06, C-F01-09), seed idempotency (C-F01-07), schema guard.
import { describe, expect, it } from 'vitest';
import { BASE_URL, WebClient, db, insertEvent, loginAs } from './helpers.ts';
import { seed } from '../../src/db/seed.ts';

describe('F01 foundation', () => {
  it('health endpoints answer', async () => {
    expect((await fetch(`${BASE_URL}/healthz`)).status).toBe(200);
    expect(await (await fetch(`${BASE_URL}/readyz`)).json()).toEqual({ status: 'ready' });
  });

  it('visitor is redirected to login from the organizer area', async () => {
    const res = await new WebClient().get('/organizer/events');
    expect(res.status).toBe(302);
    expect(res.location).toMatch(/^\/login\?next=%2Forganizer%2Fevents/);
  });

  it('participant gets 403 and organizer gets 200 (XF-F01-F02-01)', async () => {
    const participant = await loginAs('participant');
    const denied = await participant.get('/organizer/events');
    expect(denied.status).toBe(403);
    expect(denied.html).toContain('Acesso restrito');

    const organizer = await loginAs('orgA');
    expect((await organizer.get('/organizer/events')).status).toBe(200);
  });

  it('seed is idempotent', async () => {
    await seed(db);
    await seed(db);
    const { rows } = await db.query(
      "SELECT email, count(*)::int AS n FROM users WHERE email LIKE '%@catraca.local' GROUP BY email ORDER BY email",
    );
    expect(rows).toEqual([
      { email: 'organizador.a@catraca.local', n: 1 },
      { email: 'organizador.b@catraca.local', n: 1 },
      { email: 'participante@catraca.local', n: 1 },
    ]);
    const partners = await db.query(
      "SELECT count(*)::int AS n FROM partners WHERE name = 'Parceiro Demo'",
    );
    expect(partners.rows[0].n).toBe(1);
  });

  it('capacity trigger rejects overselling even without the application lock', async () => {
    const eventId = await insertEvent({ capacity: 1 });
    const insert = (code: string) =>
      db.query(
        `INSERT INTO tickets (id, event_id, code, status, price_cents, channel, buyer_email, card_last4)
         VALUES ($1, $2, $3, 'pending', 1000, 'partner', 'x@example.com', '0001')`,
        [`tkt_${code}`, eventId, code],
      );
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    await insert(`A${suffix}`);
    await expect(insert(`B${suffix}`)).rejects.toThrow(/capacity exceeded/);
  });
});
