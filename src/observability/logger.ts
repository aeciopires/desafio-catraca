// Structured JSON logger (pino). OpenTelemetry instrumentation (F09) injects trace_id/span_id.
import pino from 'pino';
import { config } from '../config.ts';

export const logger = pino({
  level: config.logLevel,
  base: { service: process.env.OTEL_SERVICE_NAME ?? 'catraca' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
