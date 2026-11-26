// Money helpers. Amounts are always integer cents internally.

/**
 * Parses a BRL amount typed by a person: "100", "100,00", "100.00", "1.234,56", "R$ 1.234,56".
 * Returns integer cents, or null when the text is not a valid amount.
 */
export function parseReaisToCents(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let text = String(input)
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');
  if (text === '') return null;
  if (text.includes(',')) {
    // Brazilian format: dots are thousand separators, comma is the decimal separator.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // "1.234" with only thousand separators.
    text = text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 35000 -> "R$ 350,00" (pt-BR formatting, deterministic, no Intl dependency). */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${whole},${frac}`;
}

/** 15000 -> "150,00" (value for an input field). */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}
