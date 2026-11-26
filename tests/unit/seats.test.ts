import { describe, expect, it } from 'vitest';
import { availableSeats } from '../../src/domain/seats.ts';

describe('availableSeats (R05)', () => {
  it('is capacity minus occupied', () => {
    expect(availableSeats({ capacity: 5, status: 'published' }, 2)).toBe(3);
    expect(availableSeats({ capacity: 5, status: 'published' }, 5)).toBe(0);
  });
  it('never goes negative', () => {
    expect(availableSeats({ capacity: 2, status: 'published' }, 3)).toBe(0);
  });
  it('is zero for a cancelled event', () => {
    expect(availableSeats({ capacity: 5, status: 'cancelled' }, 0)).toBe(0);
  });
});
