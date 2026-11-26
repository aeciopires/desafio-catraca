// Prometheus metrics (F09). One prom-client registry per process (app and worker), exposed at
// GET /metrics. Counters/histograms are per process (Prometheus sums them); the state gauges
// (tickets by status, pending confirmations, revenue, worker queue) are read from the database on
// every scrape, so they are the source of truth even with several processes.
import client from 'prom-client';
import { pool } from '../db/pool.ts';
import { logger } from './logger.ts';

export const registry = new client.Registry();
registry.setDefaultLabels({ service: process.env.OTEL_SERVICE_NAME ?? 'catraca' });
client.collectDefaultMetrics({ register: registry });

export type RejectReason = 'sold_out' | 'event_not_available' | 'invalid_card' | 'invalid_request';

export const ticketsCreated = new client.Counter({
  name: 'catraca_tickets_created_total',
  help: 'Tickets created (pending) by sales channel',
  labelNames: ['channel'] as const,
  registers: [registry],
});

export const purchasesRejected = new client.Counter({
  name: 'catraca_purchases_rejected_total',
  help: 'Purchases refused before creating a ticket, by reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const gatewayCalls = new client.Counter({
  name: 'catraca_gateway_calls_total',
  help: 'Payment gateway answers processed by the worker (applied=false: late answer ignored)',
  labelNames: ['outcome', 'applied'] as const,
  registers: [registry],
});

export const gatewayLatency = new client.Histogram({
  name: 'catraca_gateway_latency_seconds',
  help: 'Time from ticket creation to the gateway answer being processed',
  labelNames: ['outcome'] as const,
  buckets: [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 15, 30],
  registers: [registry],
});

export const checkins = new client.Counter({
  name: 'catraca_checkins_total',
  help: 'Check-in attempts by result',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const eventsCancelled = new client.Counter({
  name: 'catraca_events_cancelled_total',
  help: 'Events cancelled by organizers',
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration by method, route template and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Pre-create the known label values so every series shows up (with 0) from the first scrape.
for (const channel of ['web', 'partner']) ticketsCreated.labels(channel);
for (const reason of ['sold_out', 'event_not_available', 'invalid_card', 'invalid_request'])
  purchasesRejected.labels(reason);
for (const outcome of ['approved', 'declined'])
  for (const applied of ['true', 'false']) gatewayCalls.labels(outcome, applied);
for (const result of ['ok', 'invalid', 'cancelled', 'notConfirmed', 'alreadyUsed'])
  checkins.labels(result);

/** Records one processed gateway answer (worker). */
export function recordGatewayCall(
  outcome: 'approved' | 'declined',
  applied: boolean,
  createdAt: Date,
): void {
  gatewayCalls.inc({ outcome, applied: String(applied) });
  gatewayLatency.observe({ outcome }, Math.max(0, (Date.now() - createdAt.getTime()) / 1000));
}

// ---------------------------------------------------------------- DB-backed gauges

const TICKET_STATUSES = ['pending', 'confirmed', 'declined', 'cancelled', 'refunded'] as const;

async function dbQuery<T extends Record<string, unknown>>(sql: string): Promise<T[] | null> {
  try {
    return (await pool.query<T>(sql)).rows;
  } catch (err) {
    logger.warn({ err, code: 'METRICS_DB_QUERY_FAILED' }, 'metrics gauge query failed');
    return null;
  }
}

new client.Gauge({
  name: 'catraca_tickets_by_status',
  help: 'Tickets by status (read from the database on scrape)',
  labelNames: ['status'] as const,
  registers: [registry],
  async collect() {
    const rows = await dbQuery<{ status: string; n: number }>(
      'SELECT status, count(*)::int AS n FROM tickets GROUP BY status',
    );
    if (!rows) return;
    for (const status of TICKET_STATUSES) {
      this.set({ status }, rows.find((r) => r.status === status)?.n ?? 0);
    }
  },
});

new client.Gauge({
  name: 'catraca_pending_confirmations',
  help: 'Tickets waiting for the payment gateway answer',
  registers: [registry],
  async collect() {
    const rows = await dbQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM tickets WHERE status = 'pending'",
    );
    if (rows) this.set(rows[0]?.n ?? 0);
  },
});

new client.Gauge({
  name: 'catraca_revenue_cents',
  help: 'Revenue in cents: sum of the prices of confirmed tickets',
  registers: [registry],
  async collect() {
    const rows = await dbQuery<{ n: string | number }>(
      "SELECT COALESCE(sum(price_cents), 0)::bigint AS n FROM tickets WHERE status = 'confirmed'",
    );
    if (rows) this.set(Number(rows[0]?.n ?? 0));
  },
});

new client.Gauge({
  name: 'catraca_payment_jobs_due',
  help: 'Payment jobs scheduled and already due (worker queue backlog)',
  registers: [registry],
  async collect() {
    const rows = await dbQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM payment_jobs WHERE state = 'scheduled' AND due_at <= now()",
    );
    if (rows) this.set(rows[0]?.n ?? 0);
  },
});

/** Text exposition of every metric of this process. */
export async function renderMetrics(): Promise<{ type: string; body: string }> {
  return { type: registry.contentType, body: await registry.metrics() };
}
