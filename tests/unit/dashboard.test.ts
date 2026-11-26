import { describe, expect, it } from 'vitest';
import { buildDashboard, type DashboardCounts } from '../../src/domain/dashboard.ts';

const counts = (over: Partial<DashboardCounts> = {}): DashboardCounts => ({
  confirmed: 0,
  pending: 0,
  checkins: 0,
  refunded: 0,
  revenueCents: 0,
  ...over,
});

describe('buildDashboard (R12)', () => {
  it('available = capacity - (confirmed + pending) (R05)', () => {
    const d = buildDashboard(counts({ confirmed: 2, pending: 1 }), {
      capacity: 5,
      status: 'published',
    });
    expect(d.available).toBe(2);
  });

  it('available never goes negative', () => {
    const d = buildDashboard(counts({ confirmed: 3 }), { capacity: 2, status: 'published' });
    expect(d.available).toBe(0);
  });

  it('a cancelled event has 0 available seats', () => {
    const d = buildDashboard(counts({ refunded: 1 }), { capacity: 5, status: 'cancelled' });
    expect(d).toEqual({
      confirmed: 0,
      pending: 0,
      checkins: 0,
      refunded: 1,
      revenueCents: 0,
      available: 0,
    });
  });

  it('keeps revenue as given (confirmed only) and refunded is never revenue', () => {
    // 2 confirmed at R$ 100 + 1 at R$ 150 = R$ 350; one refunded ticket adds nothing.
    const d = buildDashboard(counts({ confirmed: 3, refunded: 1, revenueCents: 35_000 }), {
      capacity: 3,
      status: 'published',
    });
    expect(d.revenueCents).toBe(35_000);
    expect(d.refunded).toBe(1);
    expect(d.available).toBe(0);
  });

  it('check-ins are part of confirmed (not subtracted)', () => {
    const d = buildDashboard(counts({ confirmed: 3, checkins: 1 }), {
      capacity: 3,
      status: 'published',
    });
    expect(d.confirmed).toBe(3);
    expect(d.checkins).toBe(1);
    expect(d.available).toBe(0);
  });
});
