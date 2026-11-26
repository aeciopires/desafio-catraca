// Random identifiers. IDs are prefixed strings (evt_, tkt_, usr_, pay_, prt_);
// ticket codes are 8 uppercase characters without ambiguous symbols (no 0/O, 1/I).
import { randomBytes } from 'node:crypto';

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const TICKET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomString(alphabet: string, length: number): string {
  // alphabet length is 32, so `byte % 32` is unbiased.
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function newId(prefix: 'evt' | 'tkt' | 'usr' | 'pay' | 'prt'): string {
  return `${prefix}_${randomString(ID_ALPHABET, 10)}`;
}

export function newTicketCode(): string {
  return randomString(TICKET_CODE_ALPHABET, 8);
}

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}
