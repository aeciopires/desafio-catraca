// F09: Prometheus metrics on the app and the worker (C-F09-02, C-F09-03). Runs with
// OBSERVABILITY=0: /metrics is served by prom-client and does not depend on the observability stack.
import { describe, expect, it } from 'vitest';
import { BASE_URL, CARDS, insertEvent, partner, scaled, uniqueEmail, waitFor } from './helpers.ts';

const WORKER_METRICS_URL = process.env.TEST_WORKER_METRICS_URL ?? 'http://worker:9464/metrics';

const EXPECTED_METRICS = [
  'catraca_tickets_created_total',
  'catraca_purchases_rejected_total',
  'catraca_gateway_calls_total',
  'catraca_gateway_latency_seconds',
  'catraca_checkins_total',
  'catraca_events_cancelled_total',
  'catraca_tickets_by_status',
  'catraca_pending_confirmations',
  'catraca_revenue_cents',
  'catraca_payment_jobs_due',
  'http_request_duration_seconds',
];

async function scrape(url: string): Promise<string> {
  const res = await fetch(url);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type') ?? '').toContain('text/plain');
  return res.text();
}

/** Sum of the samples of `name` whose labels contain every `key="value"` of `labels`. */
function sample(text: string, name: string, labels: Record<string, string> = {}): number {
  let total = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][\w:]*)(\{[^}]*\})?\s+(\S+)/.exec(line);
    if (!m || m[1] !== name) continue;
    const labelText = m[2] ?? '';
    if (Object.entries(labels).every(([k, v]) => labelText.includes(`${k}="${v}"`))) {
      total += Number(m[3]);
    }
  }
  return total;
}

async function buy(eventId: string, cardNumber: string) {
  return partner('POST', `/api/partner/events/${eventId}/purchases`, {
    buyerEmail: uniqueEmail('metrics'),
    cardNumber,
  });
}

describe('F09 — /metrics', () => {
  it('C-F09-02: the app exposes every business and HTTP metric', async () => {
    // One request first so the HTTP histogram has at least one series.
    await fetch(`${BASE_URL}/healthz`);
    const text = await scrape(`${BASE_URL}/metrics`);
    for (const name of EXPECTED_METRICS) {
      expect(text, `missing metric ${name}`).toContain(`# TYPE ${name} `);
    }
    expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/healthz"/);
    // Default Node.js process metrics are also exported.
    expect(text).toContain('process_resident_memory_bytes');
  });

  it('C-F09-02: the worker exposes /metrics on its internal port', async () => {
    const text = await scrape(WORKER_METRICS_URL);
    expect(text).toContain('# TYPE catraca_gateway_calls_total counter');
    expect(text).toContain('# TYPE catraca_payment_jobs_due gauge');
  });

  it('C-F09-03: counters follow approved, declined and sold_out purchases', async () => {
    const appBefore = await scrape(`${BASE_URL}/metrics`);
    const workerBefore = await scrape(WORKER_METRICS_URL);
    const soldOutBefore = sample(appBefore, 'catraca_purchases_rejected_total', {
      reason: 'sold_out',
    });
    const partnerBefore = sample(appBefore, 'catraca_tickets_created_total', {
      channel: 'partner',
    });
    const gatewayBefore = sample(workerBefore, 'catraca_gateway_calls_total');
    const latencyBefore = sample(workerBefore, 'catraca_gateway_latency_seconds_count');

    const single = await insertEvent({ capacity: 1 });
    const other = await insertEvent({ capacity: 5 });
    expect((await buy(single, CARDS.approveFast)).status).toBe(202);
    expect((await buy(other, CARDS.declineFast)).status).toBe(202);
    const soldOut = await buy(single, CARDS.approveFast);
    expect(soldOut.status).toBe(409);
    expect(soldOut.json).toEqual({ error: 'sold_out' });

    const appAfter = await scrape(`${BASE_URL}/metrics`);
    expect(
      sample(appAfter, 'catraca_purchases_rejected_total', { reason: 'sold_out' }),
    ).toBeGreaterThanOrEqual(soldOutBefore + 1);
    expect(
      sample(appAfter, 'catraca_tickets_created_total', { channel: 'partner' }),
    ).toBeGreaterThanOrEqual(partnerBefore + 2);
    expect(sample(appAfter, 'catraca_pending_confirmations')).toBeGreaterThanOrEqual(1);

    // The worker applies both gateway answers (fast cards: a few seconds, scaled).
    const workerAfter = await waitFor(async () => {
      const text = await scrape(WORKER_METRICS_URL);
      return sample(text, 'catraca_gateway_calls_total') >= gatewayBefore + 2 ? text : null;
    }, scaled(4500));
    expect(
      sample(workerAfter, 'catraca_gateway_calls_total', { outcome: 'approved', applied: 'true' }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      sample(workerAfter, 'catraca_gateway_calls_total', { outcome: 'declined', applied: 'true' }),
    ).toBeGreaterThanOrEqual(1);
    expect(sample(workerAfter, 'catraca_gateway_latency_seconds_count')).toBeGreaterThanOrEqual(
      latencyBefore + 2,
    );
  });

  it('C-F09-03: invalid partner requests are counted as invalid_request', async () => {
    const before = sample(await scrape(`${BASE_URL}/metrics`), 'catraca_purchases_rejected_total', {
      reason: 'invalid_request',
    });
    const eventId = await insertEvent({ capacity: 5 });
    const res = await partner('POST', `/api/partner/events/${eventId}/purchases`, {
      buyerEmail: 'not-an-email',
    });
    expect(res.status).toBe(422);
    const after = sample(await scrape(`${BASE_URL}/metrics`), 'catraca_purchases_rejected_total', {
      reason: 'invalid_request',
    });
    expect(after).toBeGreaterThanOrEqual(before + 1);
  });
});
