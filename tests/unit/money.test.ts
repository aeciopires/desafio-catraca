import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, parseReaisToCents } from '../../src/lib/money.ts';

describe('parseReaisToCents', () => {
  it.each([
    ['100', 10000],
    ['100,00', 10000],
    ['100.00', 10000],
    ['150,5', 15050],
    ['1.234,56', 123456],
    ['1.234', 123400],
    ['R$ 20,00', 2000],
    [' 0,01 ', 1],
    [50, 5000],
  ])('parses %s -> %i', (input, cents) => {
    expect(parseReaisToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '10,999', '-5', '1,2,3', null, undefined])('rejects %s', (input) => {
    expect(parseReaisToCents(input as unknown)).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats pt-BR with thousands separator', () => {
    expect(formatCents(35000)).toBe('R$ 350,00');
    expect(formatCents(0)).toBe('R$ 0,00');
    expect(formatCents(123456789)).toBe('R$ 1.234.567,89');
    expect(centsToInput(15000)).toBe('150,00');
  });
});
