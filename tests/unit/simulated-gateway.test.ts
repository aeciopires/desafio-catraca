// F03: simulated gateway table, delay ranges and GATEWAY_DELAY_SCALE (C-F03-03).
import { describe, expect, it } from 'vitest';
import { getGateway } from '../../src/gateway/payment-gateway.ts';
import { ruleForCard, simulateDecision } from '../../src/gateway/simulated-gateway.ts';

const cases = [
  { card: '4000000000000001', decision: 'approved', min: 2000, max: 4000 },
  { card: '4000000000000002', decision: 'declined', min: 2000, max: 4000 },
  { card: '4000000000000003', decision: 'approved', min: 30000, max: 39000 },
  { card: '4000000000000004', decision: 'declined', min: 30000, max: 39000 },
  { card: '4000000000000099', decision: 'declined', min: 2000, max: 4000 },
  { card: '4111111111111111', decision: 'declined', min: 2000, max: 4000 },
] as const;

describe('simulated gateway (R08)', () => {
  for (const c of cases) {
    it(`card ending ${c.card.slice(-4)} → ${c.decision} in ${c.min}-${c.max} ms`, () => {
      expect(ruleForCard(c.card)).toEqual({ decision: c.decision, minMs: c.min, maxMs: c.max });
      // Range edges: random() = 0 gives the minimum, random() → 1 gives the maximum.
      expect(simulateDecision(c.card, 1, () => 0)).toEqual({
        decision: c.decision,
        delayMs: c.min,
      });
      expect(simulateDecision(c.card, 1, () => 0.999999).delayMs).toBe(c.max);
      for (let i = 0; i < 200; i++) {
        const { decision, delayMs } = simulateDecision(c.card, 1);
        expect(decision).toBe(c.decision);
        expect(delayMs).toBeGreaterThanOrEqual(c.min);
        expect(delayMs).toBeLessThanOrEqual(c.max);
      }
    });
  }

  it('fast decisions stay inside the brief window (2-5 s) and slow ones inside 30-40 s', () => {
    for (const end of ['0001', '0002', '0099']) {
      const r = ruleForCard(`400000000000${end}`);
      expect(r.minMs).toBeGreaterThanOrEqual(2000);
      expect(r.maxMs).toBeLessThan(5000);
    }
    for (const end of ['0003', '0004']) {
      const r = ruleForCard(`400000000000${end}`);
      expect(r.minMs).toBeGreaterThanOrEqual(30000);
      expect(r.maxMs).toBeLessThan(40000);
    }
  });

  it('applies the delay scale', () => {
    expect(simulateDecision('4000000000000001', 0.1, () => 0).delayMs).toBe(200);
    expect(simulateDecision('4000000000000003', 0.1, () => 0.999999).delayMs).toBe(3900);
    expect(simulateDecision('4000000000000004', 2, () => 0).delayMs).toBe(60000);
    expect(simulateDecision('4000000000000002', 0, () => 0.5).delayMs).toBe(0);
  });

  it('getGateway returns the simulated gateway (decision by card ending)', () => {
    const res = getGateway().submit({ ticketId: 'tkt_x', cardNumber: '4000000000000001' });
    expect(res.decision).toBe('approved');
    expect(res.delayMs).toBeGreaterThanOrEqual(0);
  });
});
