// F01: participant sign-up, login, logout (C-F01-05).
import { describe, expect, it } from 'vitest';
import { WebClient, testId, uniqueEmail, db, SEED } from './helpers.ts';

describe('F01 auth', () => {
  it('signs up a participant, keeps the session, logs out', async () => {
    const web = new WebClient();
    const email = uniqueEmail('ana');
    const res = await web.post('/signup', { name: 'Ana Teste', email, password: 'segredo123' });
    expect(res.status).toBe(303);

    const home = await web.get('/');
    expect(testId(home.html, 'current-user')).toBe('Ana Teste');

    const { rows } = await db.query('SELECT role FROM users WHERE email = $1', [email]);
    expect(rows[0].role).toBe('participant');

    const out = await web.post('/logout');
    expect(out.status).toBe(303);
    const after = await web.get('/');
    expect(testId(after.html, 'current-user')).toBeNull();
  });

  it('rejects duplicated e-mail (case-insensitive) and invalid input', async () => {
    const web = new WebClient();
    const email = uniqueEmail('dup');
    await web.signup('Dup', email);
    const other = new WebClient();
    const res = await other.post('/signup', {
      name: 'Dup 2',
      email: email.toUpperCase(),
      password: 'segredo123',
    });
    expect(res.status).toBe(422);
    expect(testId(res.html, 'form-error')).toBe('E-mail já cadastrado');

    const bad = await other.post('/signup', { name: '', email: 'x@', password: '1' });
    expect(bad.status).toBe(422);
  });

  it('cannot sign up as organizer (role field is ignored)', async () => {
    const web = new WebClient();
    const email = uniqueEmail('sneaky');
    await web.post('/signup', { name: 'Sneaky', email, password: 'segredo123', role: 'organizer' });
    const { rows } = await db.query('SELECT role FROM users WHERE email = $1', [email]);
    expect(rows[0].role).toBe('participant');
  });

  it('logs in seed accounts and rejects wrong passwords', async () => {
    const web = new WebClient();
    const ok = await web.post('/login', { email: SEED.orgA.email, password: SEED.orgA.password });
    expect(ok.status).toBe(303);
    expect(ok.location).toBe('/organizer/events');

    const bad = await new WebClient().post('/login', {
      email: SEED.orgA.email,
      password: 'errada',
    });
    expect(bad.status).toBe(401);
    expect(testId(bad.html, 'form-error')).toBe('E-mail ou senha inválidos');
  });

  it('only redirects to relative paths after login', async () => {
    const web = new WebClient();
    const res = await web.post('/login', { ...SEED.participant, next: 'https://evil.example.com' });
    expect(res.location).toBe('/');
  });
});
