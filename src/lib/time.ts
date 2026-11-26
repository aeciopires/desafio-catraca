// Date/time helpers. The product uses a fixed offset (Brasília, UTC-03:00, no DST) for input and
// display; storage is timestamptz (absolute instants).
import { config } from '../config.ts';

const OFFSET = config.tzOffset; // e.g. "-03:00"

function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Shifts an instant to the wall clock of the configured offset (fields read with getUTC*). */
function toWall(date: Date): Date {
  return new Date(date.getTime() + offsetMinutes(OFFSET) * 60_000);
}

/**
 * Parses an HTML datetime-local value ("2026-12-05T21:00" or with seconds) as wall-clock time
 * in the configured offset. Returns null for invalid input.
 */
export function parseLocalDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject overflowed dates such as 2026-02-31.
  const wall = toWall(date);
  if (wall.getUTCDate() !== Number(m[3]) || wall.getUTCMonth() + 1 !== Number(m[2])) return null;
  return date;
}

/** 2026-12-06T00:00:00Z -> "2026-12-05T21:00:00-03:00" (API format). */
export function toIsoOffset(date: Date): string {
  const w = toWall(date);
  return (
    `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}` +
    `T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:${pad(w.getUTCSeconds())}${OFFSET}`
  );
}

/** Value for an <input type="datetime-local">. */
export function toLocalInput(date: Date): string {
  return toIsoOffset(date).slice(0, 16);
}

/** "05/12/2026 21:00" for display. */
export function formatDateTimeBR(date: Date): string {
  const w = toWall(date);
  return `${pad(w.getUTCDate())}/${pad(w.getUTCMonth() + 1)}/${w.getUTCFullYear()} ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}
