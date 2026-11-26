// F02: event form validation (R01) — C-F02-02, C-F02-07.
import { describe, expect, it } from 'vitest';
import { MESSAGES, validateEventInput } from '../../src/domain/events.ts';

// 2026-06-01 12:00 at UTC-03:00.
const NOW = new Date('2026-06-01T15:00:00Z');

const valid = {
  name: '  Show da Banda  ',
  startsAt: '2026-12-05T21:00',
  venue: ' Bar do Zé ',
  capacity: '100',
  price: '150,00',
};

function errorsOf(raw: Record<string, unknown>): string[] {
  const result = validateEventInput(raw, NOW);
  return result.ok ? [] : result.errors;
}

describe('validateEventInput', () => {
  it('accepts valid input, trims texts and converts values', () => {
    const result = validateEventInput(valid, NOW);
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Show da Banda',
        venue: 'Bar do Zé',
        startsAt: new Date('2026-12-06T00:00:00Z'),
        capacity: 100,
        priceCents: 15000,
      },
    });
  });

  it.each([
    ['150', 15000],
    ['150,5', 15050],
    ['150.50', 15050],
    ['1.234,56', 123456],
    ['0,01', 1],
  ])('accepts price %s (comma or dot decimal) -> %i cents', (price, cents) => {
    const result = validateEventInput({ ...valid, price }, NOW);
    expect(result.ok && result.value.priceCents).toBe(cents);
  });

  it('requires name and venue', () => {
    expect(errorsOf({ ...valid, name: '   ', venue: '' })).toEqual([
      MESSAGES.nameRequired,
      MESSAGES.venueRequired,
    ]);
    expect(MESSAGES.nameRequired).toBe('Preencha o nome do evento');
    expect(MESSAGES.venueRequired).toBe('Preencha o local do evento');
  });

  it('rejects a start date in the past or equal to now', () => {
    const past = errorsOf({ ...valid, startsAt: '2026-05-31T21:00' });
    expect(past).toEqual(['A data de início precisa estar no futuro']);
    expect(errorsOf({ ...valid, startsAt: '2026-06-01T12:00' })).toEqual([MESSAGES.startsAtPast]);
    expect(errorsOf({ ...valid, startsAt: '2026-06-01T12:01' })).toEqual([]);
  });

  it.each(['', 'amanhã', '2026-02-31T10:00', '2026-12-05'])('rejects invalid date %j', (v) => {
    expect(errorsOf({ ...valid, startsAt: v })).toEqual([MESSAGES.startsAtInvalid]);
  });

  it.each(['0', '-1', '1.5', '2,5', 'abc', '', '1e3'])('rejects capacity %j', (capacity) => {
    expect(errorsOf({ ...valid, capacity })).toEqual([
      'A lotação deve ser um número inteiro maior ou igual a 1',
    ]);
  });

  it('accepts capacity 1 and rejects absurdly large capacity', () => {
    expect(errorsOf({ ...valid, capacity: '1' })).toEqual([]);
    expect(errorsOf({ ...valid, capacity: 5 })).toEqual([]);
    expect(errorsOf({ ...valid, capacity: '99999999999' })).toEqual([MESSAGES.capacityTooLarge]);
  });

  it.each(['0', '0,00', '-10', 'abc', '', '10,999'])('rejects price %j', (price) => {
    expect(errorsOf({ ...valid, price })).toEqual(['O preço deve ser maior que zero']);
  });

  it('rejects absurdly large price', () => {
    expect(errorsOf({ ...valid, price: '1.000.000,01' })).toEqual([MESSAGES.priceTooLarge]);
  });

  it('reports every error at once', () => {
    expect(errorsOf({})).toEqual([
      MESSAGES.nameRequired,
      MESSAGES.startsAtInvalid,
      MESSAGES.venueRequired,
      MESSAGES.capacityInvalid,
      MESSAGES.priceInvalid,
    ]);
  });

  it('formats the capacity-below-occupied message', () => {
    expect(MESSAGES.capacityBelowOccupied(2)).toBe(
      'A lotação não pode ser menor que as vagas ocupadas (2)',
    );
  });
});
