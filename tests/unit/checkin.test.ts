// F06: R10 decision order (C-F06-07).
import { describe, expect, it } from 'vitest';
import { CHECKIN_MESSAGES, decideCheckin, normalizeCode } from '../../src/domain/checkin.ts';
import type { EventStatus, TicketStatus } from '../../src/domain/types.ts';

const EVENT = 'evt_one';
const published = { status: 'published' as EventStatus };
const cancelled = { status: 'cancelled' as EventStatus };

function ticket(status: TicketStatus = 'confirmed', checkedIn = false, eventId = EVENT) {
  return { event_id: eventId, status, checked_in: checkedIn };
}

describe('CHECKIN_MESSAGES (R10 exact texts)', () => {
  it('has the exact messages of the brief', () => {
    expect(CHECKIN_MESSAGES).toEqual({
      invalid: 'Ingresso inválido para este evento',
      cancelled: 'Evento cancelado',
      notConfirmed: 'Ingresso não confirmado',
      alreadyUsed: 'Ingresso já utilizado',
      ok: 'Entrada liberada',
    });
  });
});

describe('decideCheckin (R10 order)', () => {
  it('1: missing ticket → invalid, even for a cancelled event', () => {
    expect(decideCheckin(null, EVENT, published)).toBe('invalid');
    expect(decideCheckin(null, EVENT, cancelled)).toBe('invalid');
  });

  it('1: ticket of another event → invalid, beating cancelled/not confirmed/used', () => {
    expect(decideCheckin(ticket('confirmed', false, 'evt_other'), EVENT, published)).toBe(
      'invalid',
    );
    expect(decideCheckin(ticket('confirmed', false, 'evt_other'), EVENT, cancelled)).toBe(
      'invalid',
    );
    expect(decideCheckin(ticket('pending', false, 'evt_other'), EVENT, cancelled)).toBe('invalid');
    expect(decideCheckin(ticket('confirmed', true, 'evt_other'), EVENT, published)).toBe('invalid');
  });

  it('2: cancelled event beats not confirmed and already used', () => {
    expect(decideCheckin(ticket('confirmed'), EVENT, cancelled)).toBe('cancelled');
    expect(decideCheckin(ticket('pending'), EVENT, cancelled)).toBe('cancelled');
    expect(decideCheckin(ticket('refunded'), EVENT, cancelled)).toBe('cancelled');
    expect(decideCheckin(ticket('cancelled'), EVENT, cancelled)).toBe('cancelled');
    expect(decideCheckin(ticket('confirmed', true), EVENT, cancelled)).toBe('cancelled');
  });

  it('3: any non-confirmed status → notConfirmed (even if somehow checked in)', () => {
    for (const status of ['pending', 'declined', 'cancelled', 'refunded'] as TicketStatus[]) {
      expect(decideCheckin(ticket(status), EVENT, published)).toBe('notConfirmed');
    }
    expect(decideCheckin(ticket('refunded', true), EVENT, published)).toBe('notConfirmed');
  });

  it('4: confirmed and already checked in → alreadyUsed', () => {
    expect(decideCheckin(ticket('confirmed', true), EVENT, published)).toBe('alreadyUsed');
  });

  it('5: confirmed, not checked in, event not cancelled → ok', () => {
    expect(decideCheckin(ticket('confirmed'), EVENT, published)).toBe('ok');
  });
});

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  ab12cd34 ')).toBe('AB12CD34');
    expect(normalizeCode('   ')).toBe('');
  });
});
