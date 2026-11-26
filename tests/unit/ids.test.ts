import { describe, expect, it } from 'vitest';
import { newId, newTicketCode } from '../../src/lib/ids.ts';

describe('ids', () => {
  it('prefixes ids', () => {
    expect(newId('evt')).toMatch(/^evt_[a-z2-9]{10}$/);
    expect(newId('tkt')).toMatch(/^tkt_[a-z2-9]{10}$/);
  });

  it('ticket codes have 8 unambiguous uppercase chars and do not repeat', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => newTicketCode()));
    expect(codes.size).toBe(5000);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});
