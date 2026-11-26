// F02: event management by the organizer (C-F02-01..08).
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  WebClient,
  db,
  futureLocal,
  hasTestId,
  loginAs,
  pastLocal,
  testId,
  testIdAll,
  uniqueEmail,
  uniqueName,
} from './helpers.ts';

function eventForm(overrides: Record<string, string | number> = {}) {
  return {
    name: uniqueName('Show F02'),
    startsAt: futureLocal(30),
    venue: 'Bar do Zé',
    capacity: 10,
    price: '150,00',
    ...overrides,
  };
}

async function createViaUi(
  web: WebClient,
  overrides: Record<string, string | number> = {},
): Promise<{ id: string; name: string }> {
  const form = eventForm(overrides);
  const res = await web.post('/organizer/events', form);
  expect(res.status).toBe(303);
  const m = /^\/organizer\/events\/(evt_[a-z0-9]+)$/.exec(res.location ?? '');
  expect(m).not.toBeNull();
  return { id: m![1]!, name: String(form.name) };
}

async function insertTicket(eventId: string, status: 'pending' | 'confirmed'): Promise<void> {
  const suffix = randomBytes(4).toString('hex');
  await db.query(
    `INSERT INTO tickets (id, event_id, code, status, price_cents, channel, buyer_email, card_last4)
     VALUES ($1, $2, $3, $4, 15000, 'partner', $5, '0001')`,
    [
      `tkt_t${suffix}`,
      eventId,
      `T${suffix.toUpperCase()}`.slice(0, 8),
      status,
      uniqueEmail('buyer'),
    ],
  );
}

async function eventStatus(id: string): Promise<string> {
  const { rows } = await db.query('SELECT status FROM events WHERE id = $1', [id]);
  return rows[0].status;
}

describe('F02 event management', () => {
  it('C-F02-01: a new event is created as draft and redirects to its management page', async () => {
    const web = await loginAs('orgA');
    const { id, name } = await createViaUi(web);

    const page = await web.get(`/organizer/events/${id}`);
    expect(page.status).toBe(200);
    expect(testId(page.html, 'event-name')).toBe(name);
    expect(testId(page.html, 'event-status')).toBe('Rascunho');
    expect(await eventStatus(id)).toBe('draft');

    const list = await web.get('/organizer/events');
    expect(list.status).toBe(200);
    const rows = testIdAll(list.html, 'org-event-row');
    const row = rows.find((r) => r.includes(name));
    expect(row).toBeDefined();
    expect(row).toContain('Rascunho');
    expect(list.html).toContain(`href="/organizer/events/${id}"`);
  });

  it('C-F02-01: the new-event form has the expected fields', async () => {
    const web = await loginAs('orgA');
    const res = await web.get('/organizer/events/new');
    expect(res.status).toBe(200);
    for (const field of ['name', 'startsAt', 'venue', 'capacity', 'price']) {
      expect(res.html).toContain(`name="${field}"`);
    }
    expect(res.html).toContain('type="datetime-local"');
  });

  it('C-F02-02: validation errors on create', async () => {
    const web = await loginAs('orgA');
    const name = uniqueName('Inválido');

    const past = await web.post('/organizer/events', eventForm({ name, startsAt: pastLocal(1) }));
    expect(past.status).toBe(422);
    expect(testId(past.html, 'form-error')).toContain('A data de início precisa estar no futuro');

    const zeroCapacity = await web.post('/organizer/events', eventForm({ name, capacity: 0 }));
    expect(zeroCapacity.status).toBe(422);
    expect(testId(zeroCapacity.html, 'form-error')).toContain(
      'A lotação deve ser um número inteiro maior ou igual a 1',
    );

    const zeroPrice = await web.post('/organizer/events', eventForm({ name, price: '0' }));
    expect(zeroPrice.status).toBe(422);
    expect(testId(zeroPrice.html, 'form-error')).toContain('O preço deve ser maior que zero');

    const empty = await web.post('/organizer/events', eventForm({ name: ' ', venue: '' }));
    expect(empty.status).toBe(422);
    expect(testId(empty.html, 'form-error')).toContain('Preencha o nome do evento');
    expect(testId(empty.html, 'form-error')).toContain('Preencha o local do evento');

    // Submitted values are kept in the form.
    expect(zeroPrice.html).toContain(`value="${name}"`);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM events WHERE name = $1', [
      name,
    ]);
    expect(rows[0].n).toBe(0);
  });

  it('C-F02-02: a past start date is rejected on edit too', async () => {
    const web = await loginAs('orgA');
    const { id, name } = await createViaUi(web);
    const res = await web.post(
      `/organizer/events/${id}`,
      eventForm({ name, startsAt: pastLocal(2) }),
    );
    expect(res.status).toBe(422);
    expect(testId(res.html, 'form-error')).toContain('A data de início precisa estar no futuro');
    expect(hasTestId(res.html, 'edit-form')).toBe(true);
  });

  it('C-F02-03: capacity cannot go below occupied seats (pending + confirmed)', async () => {
    const web = await loginAs('orgA');
    const { id, name } = await createViaUi(web, { capacity: 5 });
    await insertTicket(id, 'pending');
    await insertTicket(id, 'confirmed');

    const below = await web.post(`/organizer/events/${id}`, eventForm({ name, capacity: 1 }));
    expect(below.status).toBe(422);
    expect(testId(below.html, 'form-error')).toContain(
      'A lotação não pode ser menor que as vagas ocupadas (2)',
    );
    const { rows } = await db.query('SELECT capacity FROM events WHERE id = $1', [id]);
    expect(rows[0].capacity).toBe(5);

    const ok = await web.post(`/organizer/events/${id}`, eventForm({ name, capacity: 3 }));
    expect(ok.status).toBe(303);
    expect(ok.location).toBe(`/organizer/events/${id}?ok=updated`);
    const page = await web.get(ok.location!);
    expect(testId(page.html, 'event-capacity')).toBe('3');
    expect(page.html).toMatch(/name="capacity"[^>]*value="3"/);
    expect(hasTestId(page.html, 'flash')).toBe(true);
  });

  it('C-F02-03: edit updates every field and prefills the form with current values', async () => {
    const web = await loginAs('orgA');
    const { id } = await createViaUi(web);
    const newName = uniqueName('Editado');
    const startsAt = futureLocal(45, 20);
    const res = await web.post(`/organizer/events/${id}`, {
      name: newName,
      startsAt,
      venue: 'Teatro Novo',
      capacity: 50,
      price: '99,90',
    });
    expect(res.status).toBe(303);
    const page = await web.get(`/organizer/events/${id}`);
    expect(testId(page.html, 'event-name')).toBe(newName);
    expect(testId(page.html, 'event-venue')).toBe('Teatro Novo');
    expect(testId(page.html, 'event-price')).toBe('R$ 99,90');
    expect(page.html).toContain(`value="${startsAt}"`);
    expect(page.html).toContain('value="99,90"');
  });

  it('C-F02-04: management page has its own URL with name, edit form and publish button', async () => {
    const web = await loginAs('orgA');
    const { id, name } = await createViaUi(web);
    const page = await web.get(`/organizer/events/${id}`);
    expect(page.status).toBe(200);
    expect(testId(page.html, 'event-name')).toBe(name);
    expect(hasTestId(page.html, 'edit-form')).toBe(true);
    expect(hasTestId(page.html, 'publish-button')).toBe(true);
  });

  it('C-F02-05: organizers are isolated from each other', async () => {
    const webA = await loginAs('orgA');
    const { id, name } = await createViaUi(webA);
    const webB = await loginAs('orgB');

    const list = await webB.get('/organizer/events');
    expect(list.status).toBe(200);
    expect(list.html).not.toContain(name);

    const page = await webB.get(`/organizer/events/${id}`);
    expect(page.status).toBe(404);
    expect(page.html).toContain('Evento não encontrado');
    expect(page.html).not.toContain(name);

    const edit = await webB.post(`/organizer/events/${id}`, eventForm({ name: 'Hackeado' }));
    expect(edit.status).toBe(404);
    expect(edit.html).not.toContain(name);

    const publish = await webB.post(`/organizer/events/${id}/publish`);
    expect(publish.status).toBe(404);
    expect(publish.html).not.toContain(name);

    const { rows } = await db.query('SELECT name, status FROM events WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ name, status: 'draft' });

    const missing = await webA.get('/organizer/events/evt_naoexiste');
    expect(missing.status).toBe(404);
    expect(missing.html).toContain('Evento não encontrado');
  });

  it('C-F02-06: publishing a draft', async () => {
    const web = await loginAs('orgA');
    const { id } = await createViaUi(web);
    const res = await web.post(`/organizer/events/${id}/publish`);
    expect(res.status).toBe(303);
    expect(res.location).toBe(`/organizer/events/${id}?ok=published`);
    const page = await web.get(res.location!);
    expect(testId(page.html, 'event-status')).toBe('Publicado');
    expect(hasTestId(page.html, 'flash')).toBe(true);
    expect(hasTestId(page.html, 'publish-button')).toBe(false);
    expect(hasTestId(page.html, 'edit-form')).toBe(true);
    expect(await eventStatus(id)).toBe('published');

    // Publishing again is a no-op.
    const again = await web.post(`/organizer/events/${id}/publish`);
    expect(again.status).toBe(303);
    expect(await eventStatus(id)).toBe('published');
  });

  it('C-F02-06: a cancelled event cannot be edited nor republished', async () => {
    const web = await loginAs('orgA');
    const { id, name } = await createViaUi(web);
    await db.query("UPDATE events SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [
      id,
    ]);

    const page = await web.get(`/organizer/events/${id}`);
    expect(page.status).toBe(200);
    expect(testId(page.html, 'event-status')).toBe('Cancelado');
    expect(hasTestId(page.html, 'edit-form')).toBe(false);
    expect(hasTestId(page.html, 'publish-button')).toBe(false);

    const edit = await web.post(`/organizer/events/${id}`, eventForm({ name: `${name} 2` }));
    expect(edit.status).toBe(422);
    expect(testId(edit.html, 'form-error')).toContain('Evento cancelado não pode ser editado');
    expect(hasTestId(edit.html, 'edit-form')).toBe(false);

    const publish = await web.post(`/organizer/events/${id}/publish`);
    expect(publish.status).not.toBe(303);
    expect(await eventStatus(id)).toBe('cancelled');
    const { rows } = await db.query('SELECT name FROM events WHERE id = $1', [id]);
    expect(rows[0].name).toBe(name);
  });

  it('C-F02-08: seed organizer reaches the list; participant gets 403 on the new-event form', async () => {
    const organizer = await loginAs('orgA');
    expect((await organizer.get('/organizer/events')).status).toBe(200);
    const participant = await loginAs('participant');
    const denied = await participant.get('/organizer/events/new');
    expect(denied.status).toBe(403);
    expect(denied.html).toContain('Acesso restrito');
    const post = await participant.post('/organizer/events', eventForm());
    expect(post.status).toBe(403);
    const visitor = await new WebClient().get('/organizer/events/new');
    expect(visitor.status).toBe(302);
  });
});
