// OpenTelemetry bootstrap (F09). Loaded before the app/worker with
//   node --import ./src/observability/otel.ts src/main.ts
// Sends traces and logs (pino records, with trace_id/span_id) over OTLP HTTP to the Collector
// (OTEL_EXPORTER_OTLP_ENDPOINT). With OTEL_SDK_DISABLED=true (the default when OBSERVABILITY=0)
// nothing is loaded and nothing tries to connect anywhere.
// Metrics do not go through OpenTelemetry: Prometheus scrapes /metrics (prom-client).

const disabled = (process.env.OTEL_SDK_DISABLED ?? 'true').trim().toLowerCase() === 'true';

if (!disabled) {
  // The app is ESM: instrumentations can only patch ESM-imported packages through an
  // import-in-the-middle loader hook (synchronous, in-thread). Limited to what we instrument.
  const { register } = await import('import-in-the-middle/register-hooks.mjs');
  register({ include: ['pino', 'pg', 'fastify', 'node:http', 'http', 'node:https', 'https'] });

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-http');
  const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'catraca',
    traceExporter: new OTLPTraceExporter(),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Only what the product uses; fs/dns/net would add noise to every trace.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // Only DB queries inside a request become spans: the worker polls the database every
        // WORKER_POLL_MS and would otherwise flood Jaeger with one-span traces.
        '@opentelemetry/instrumentation-pg': { requireParentSpan: true },
        '@opentelemetry/instrumentation-http': {
          // Health probes and Prometheus scrapes are not interesting traces.
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url.startsWith('/healthz') || url.startsWith('/metrics');
          },
        },
      }),
    ],
  });
  sdk.start();

  const shutdown = () => {
    sdk.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

export {};
