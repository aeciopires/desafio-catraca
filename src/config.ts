// Centralized environment configuration. Every value has a safe local default so that
// `make up` works from a clean clone without any .env file.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(
      `[ERRO][CFG-001] Variável ${name} inválida: "${raw}" (esperado número). Corrija o valor ou remova para usar o padrão ${fallback}.`,
    );
  }
  return value;
}

export const config = {
  port: num('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://catraca:catraca@localhost:5432/catraca',
  sessionSecret: process.env.SESSION_SECRET ?? 'local-dev-session-secret-change-me-0123456789',
  partnerApiKey: process.env.PARTNER_API_KEY ?? 'catraca-partner-key-dev',
  gatewayMode: process.env.GATEWAY_MODE ?? 'simulated',
  gatewayDelayScale: num('GATEWAY_DELAY_SCALE', 1),
  workerPollMs: num('WORKER_POLL_MS', 200),
  metricsPort: num('METRICS_PORT', 9464),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Brazil (Brasília) has no daylight saving time since 2019: a fixed offset is enough.
  tzOffset: process.env.APP_TZ_OFFSET ?? '-03:00',
  sessionTtlDays: num('SESSION_TTL_DAYS', 7),
} as const;

if (config.gatewayMode !== 'simulated') {
  throw new Error(
    `[ERRO][CFG-002] GATEWAY_MODE="${config.gatewayMode}" não suportado. Use "simulated" (único modo do MVP).`,
  );
}
