// Shared helpers for integration tests. Tests run inside the "tools" container against the live
// stack (BASE_URL=http://app:8080) and the same Postgres (DATABASE_URL).
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
export const PARTNER_KEY = process.env.PARTNER_API_KEY ?? 'catraca-partner-key-dev';
export const DELAY_SCALE = Number(process.env.GATEWAY_DELAY_SCALE ?? '1');

export const SEED = {
  orgA: { email: 'organizador.a@catraca.local', password: 'catraca123' },
  orgB: { email: 'organizador.b@catraca.local', password: 'catraca123' },
  participant: { email: 'participante@catraca.local', password: 'catraca123' },
} as const;

/** Cards from the brief (last 4 digits drive the simulated gateway). */
export const CARDS = {
  approveFast: '4000000000000001',
  declineFast: '4000000000000002',
  approveSlow: '4000000000000003',
  declineSlow: '4000000000000004',
  other: '4000000000000099',
} as const;

pg.types.setTypeParser(20, (v) => Number(v));
export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://catraca:catraca@localhost:5432/catraca',
  max: 5,
});

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomBytes(4).toString('hex')}@example.com`;
}

export function uniqueName(prefix = 'Evento'): string {
  return `${prefix} ${randomBytes(3).toString('hex')}`;
}

/** datetime-local value N days from now (wall clock, UTC-03:00). */
export function futureLocal(days = 30, hour = 21): string {
  const d = new Date(Date.now() + days * 86_400_000 - 3 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
}

export function pastLocal(days = 1): string {
  const d = new Date(Date.now() - days * 86_400_000 - 3 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T10:00`;
}

export interface WebResponse {
  status: number;
  location: string | null;
  html: string;
}

/** Minimal browser: keeps cookies, posts forms, does NOT follow redirects automatically. */
export class WebClient {
  private cookies = new Map<string, string>();

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const idx = pair!.indexOf('=');
      const name = pair!.slice(0, idx).trim();
      const value = pair!.slice(idx + 1).trim();
      if (value === '' || /max-age=0|expires=thu, 01 jan 1970/i.test(raw))
        this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    method: string,
    path: string,
    form?: Record<string, string | number>,
  ): Promise<WebResponse> {
    const headers: Record<string, string> = { cookie: this.cookieHeader() };
    let body: string | undefined;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString();
    }
    const res = await fetch(`${BASE_URL}${path}`, { method, headers, body, redirect: 'manual' });
    this.store(res);
    return { status: res.status, location: res.headers.get('location'), html: await res.text() };
  }

  get(path: string): Promise<WebResponse> {
    return this.request('GET', path);
  }

  post(path: string, form: Record<string, string | number> = {}): Promise<WebResponse> {
    return this.request('POST', path, form);
  }

  /** GET following redirects (up to 5). */
  async follow(path: string): Promise<WebResponse> {
    let res = await this.get(path);
    for (let i = 0; i < 5 && res.location && res.status >= 300 && res.status < 400; i++) {
      res = await this.get(res.location.replace(BASE_URL, ''));
    }
    return res;
  }

  async login(email: string, password: string): Promise<WebResponse> {
    const res = await this.post('/login', { email, password });
    if (res.status !== 303) throw new Error(`login failed for ${email}: HTTP ${res.status}`);
    return res;
  }

  async signup(name: string, email: string, password = 'segredo123'): Promise<WebResponse> {
    const res = await this.post('/signup', { name, email, password });
    if (res.status !== 303) throw new Error(`signup failed for ${email}: HTTP ${res.status}`);
    return res;
  }
}

export async function loginAs(who: keyof typeof SEED): Promise<WebClient> {
  const client = new WebClient();
  await client.login(SEED[who].email, SEED[who].password);
  return client;
}

/** Text content of the first element with data-testid="<id>" (tags stripped), or null. */
export function testId(html: string, id: string): string | null {
  const re = new RegExp(`<([a-z0-9]+)[^>]*data-testid="${id}"[^>]*>([\\s\\S]*?)</\\1>`, 'i');
  const m = re.exec(html);
  return m ? decodeEntities(m[2]!.replace(/<[^>]+>/g, '').trim()) : null;
}

/** All text contents for data-testid="<id>". */
export function testIdAll(html: string, id: string): string[] {
  const re = new RegExp(`<([a-z0-9]+)[^>]*data-testid="${id}"[^>]*>([\\s\\S]*?)</\\1>`, 'gi');
  return [...html.matchAll(re)].map((m) => decodeEntities(m[2]!.replace(/<[^>]+>/g, '').trim()));
}

export function hasTestId(html: string, id: string): boolean {
  return html.includes(`data-testid="${id}"`);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

/** Partner API call. Pass key=null to omit the header. */
export async function partner(
  method: string,
  path: string,
  body?: unknown,
  key: string | null = PARTNER_KEY,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (key !== null) headers['x-api-key'] = key;
  let payload: string | undefined;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

/** Polls `fn` until it returns a truthy value or the timeout expires. */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs: number,
  stepMs = 100,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null | undefined | false;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last as T;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms (last value: ${JSON.stringify(last)})`);
}

/** Scaled gateway time: the brief's delays multiplied by GATEWAY_DELAY_SCALE (+ polling slack). */
export function scaled(ms: number): number {
  return Math.ceil(ms * DELAY_SCALE) + 1500;
}

export async function seedUserId(who: keyof typeof SEED): Promise<string> {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    SEED[who].email,
  ]);
  return rows[0]!.id;
}

/**
 * Inserts an event directly in the database (for tests of features that run before/independently
 * of the event-management UI). Returns the event id.
 */
export async function insertEvent(
  opts: {
    organizer?: keyof typeof SEED;
    name?: string;
    capacity?: number;
    priceCents?: number;
    status?: 'draft' | 'published' | 'cancelled';
    startsInDays?: number;
  } = {},
): Promise<string> {
  const id = `evt_t${randomBytes(5).toString('hex')}`;
  const organizerId = await seedUserId(opts.organizer ?? 'orgA');
  await db.query(
    `INSERT INTO events (id, organizer_id, name, starts_at, venue, capacity, price_cents, status, published_at)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval, 'Bar do Teste', $5, $6, $7,
             CASE WHEN $7 = 'draft' THEN NULL ELSE now() END)`,
    [
      id,
      organizerId,
      opts.name ?? uniqueName(),
      String(opts.startsInDays ?? 30),
      opts.capacity ?? 5,
      opts.priceCents ?? 10000,
      opts.status ?? 'published',
    ],
  );
  return id;
}
