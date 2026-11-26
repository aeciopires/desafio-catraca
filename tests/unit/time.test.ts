import { describe, expect, it } from 'vitest';
import {
  formatDateTimeBR,
  parseLocalDateTime,
  toIsoOffset,
  toLocalInput,
} from '../../src/lib/time.ts';

describe('time helpers (UTC-03:00)', () => {
  it('parses datetime-local as Brasília wall clock', () => {
    const d = parseLocalDateTime('2026-12-05T21:00');
    expect(d?.toISOString()).toBe('2026-12-06T00:00:00.000Z');
  });

  it('formats ISO with offset and for display/input', () => {
    const d = new Date('2026-12-06T00:00:00Z');
    expect(toIsoOffset(d)).toBe('2026-12-05T21:00:00-03:00');
    expect(toLocalInput(d)).toBe('2026-12-05T21:00');
    expect(formatDateTimeBR(d)).toBe('05/12/2026 21:00');
  });

  it.each(['', '2026-02-31T10:00', '05/12/2026 21:00', '2026-12-05', 42])('rejects %s', (v) => {
    expect(parseLocalDateTime(v)).toBeNull();
  });
});
