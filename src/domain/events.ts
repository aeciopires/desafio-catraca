// Event management (R01–R04, R13 and the "cannot be edited nor republished" part of R11).
// Capacity edits take the event lock and compare against occupied seats (seats.ts), the same
// lock purchases take, so a capacity cut can never race with a sale.
import { query, withTransaction } from '../db/pool.ts';
import { DomainError } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { parseReaisToCents } from '../lib/money.ts';
import { parseLocalDateTime } from '../lib/time.ts';
import { OCCUPIED_SEATS_SQL, availableSeats, countOccupiedSeats, lockEvent } from './seats.ts';
import type { EventRow } from './types.ts';

/** Upper bounds keep values inside the int4 columns (and sane). */
export const MAX_CAPACITY = 1_000_000;
export const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00

export const MESSAGES = {
  nameRequired: 'Preencha o nome do evento',
  venueRequired: 'Preencha o local do evento',
  startsAtInvalid: 'Informe uma data de início válida',
  startsAtPast: 'A data de início precisa estar no futuro',
  capacityInvalid: 'A lotação deve ser um número inteiro maior ou igual a 1',
  capacityTooLarge: 'A lotação máxima é 1.000.000',
  priceInvalid: 'O preço deve ser maior que zero',
  priceTooLarge: 'O preço máximo é R$ 1.000.000,00',
  cancelledEdit: 'Evento cancelado não pode ser editado',
  cancelledPublish: 'Evento cancelado não pode ser publicado',
  capacityBelowOccupied: (n: number) => `A lotação não pode ser menor que as vagas ocupadas (${n})`,
} as const;

export interface EventInput {
  name: string;
  venue: string;
  startsAt: Date;
  capacity: number;
  priceCents: number;
}

export type RawEventInput = Record<string, unknown>;

export type ValidationResult = { ok: true; value: EventInput } | { ok: false; errors: string[] };

export interface PublishedEvent extends EventRow {
  availableSeats: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Validates the create/edit form (R01). `now` is injectable for tests. */
export function validateEventInput(raw: RawEventInput, now: Date = new Date()): ValidationResult {
  const errors: string[] = [];
  const name = text(raw.name);
  const venue = text(raw.venue);
  if (!name) errors.push(MESSAGES.nameRequired);

  const startsAt = parseLocalDateTime(raw.startsAt);
  if (!startsAt) errors.push(MESSAGES.startsAtInvalid);
  else if (startsAt.getTime() <= now.getTime()) errors.push(MESSAGES.startsAtPast);

  if (!venue) errors.push(MESSAGES.venueRequired);

  const capacityText = typeof raw.capacity === 'number' ? String(raw.capacity) : text(raw.capacity);
  const capacity = /^\d+$/.test(capacityText) ? Number(capacityText) : NaN;
  if (!Number.isSafeInteger(capacity) || capacity < 1) errors.push(MESSAGES.capacityInvalid);
  else if (capacity > MAX_CAPACITY) errors.push(MESSAGES.capacityTooLarge);

  const priceCents = parseReaisToCents(raw.price);
  if (priceCents === null || priceCents <= 0) errors.push(MESSAGES.priceInvalid);
  else if (priceCents > MAX_PRICE_CENTS) errors.push(MESSAGES.priceTooLarge);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, venue, startsAt: startsAt!, capacity, priceCents: priceCents! },
  };
}

function validOrThrow(raw: RawEventInput, now: Date): EventInput {
  const result = validateEventInput(raw, now);
  if (!result.ok) throw new DomainError('validation_failed', result.errors[0], result.errors);
  return result.value;
}

/** Creates a draft event owned by the organizer (R01). Throws `validation_failed`. */
export async function createEvent(
  organizerId: string,
  raw: RawEventInput,
  now: Date = new Date(),
): Promise<EventRow> {
  const input = validOrThrow(raw, now);
  const { rows } = await query<EventRow>(
    `INSERT INTO events (id, organizer_id, name, starts_at, venue, capacity, price_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft') RETURNING *`,
    [
      newId('evt'),
      organizerId,
      input.name,
      input.startsAt,
      input.venue,
      input.capacity,
      input.priceCents,
    ],
  );
  return rows[0]!;
}

/**
 * Edits an event (R01, R03). Under the event lock: owner check (`not_found`), cancelled
 * (`event_cancelled`), validation (`validation_failed`), capacity >= occupied seats
 * (`capacity_below_occupied`). A new price only affects future purchases: tickets freeze theirs.
 */
export async function updateEvent(
  organizerId: string,
  eventId: string,
  raw: RawEventInput,
  now: Date = new Date(),
): Promise<EventRow> {
  return withTransaction(async (client) => {
    const event = await lockEvent(client, eventId);
    if (!event || event.organizer_id !== organizerId) {
      throw new DomainError('not_found', 'Evento não encontrado');
    }
    if (event.status === 'cancelled') {
      throw new DomainError('event_cancelled', MESSAGES.cancelledEdit, [MESSAGES.cancelledEdit]);
    }
    const input = validOrThrow(raw, now);
    const occupied = await countOccupiedSeats(client, eventId);
    if (input.capacity < occupied) {
      const message = MESSAGES.capacityBelowOccupied(occupied);
      throw new DomainError('capacity_below_occupied', message, [message]);
    }
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET name = $2, starts_at = $3, venue = $4, capacity = $5, price_cents = $6,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [eventId, input.name, input.startsAt, input.venue, input.capacity, input.priceCents],
    );
    return rows[0]!;
  });
}

/** draft -> published (R02); already published is a no-op; cancelled -> `event_cancelled`. */
export async function publishEvent(organizerId: string, eventId: string): Promise<EventRow> {
  return withTransaction(async (client) => {
    const event = await lockEvent(client, eventId);
    if (!event || event.organizer_id !== organizerId) {
      throw new DomainError('not_found', 'Evento não encontrado');
    }
    if (event.status === 'cancelled') {
      throw new DomainError('event_cancelled', MESSAGES.cancelledPublish, [
        MESSAGES.cancelledPublish,
      ]);
    }
    if (event.status === 'published') return event;
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET status = 'published', published_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [eventId],
    );
    return rows[0]!;
  });
}

/** The event only if it belongs to the organizer (R13); otherwise null. */
export async function findOwnedEvent(
  organizerId: string,
  eventId: string,
): Promise<EventRow | null> {
  const { rows } = await query<EventRow>(
    'SELECT * FROM events WHERE id = $1 AND organizer_id = $2',
    [eventId, organizerId],
  );
  return rows[0] ?? null;
}

/** The organizer's events, most recent first. */
export async function listOrganizerEvents(organizerId: string): Promise<EventRow[]> {
  const { rows } = await query<EventRow>(
    'SELECT * FROM events WHERE organizer_id = $1 ORDER BY created_at DESC, id DESC',
    [organizerId],
  );
  return rows;
}

type EventWithOccupied = EventRow & { occupied: number };

function withAvailability({ occupied, ...event }: EventWithOccupied): PublishedEvent {
  return { ...event, availableSeats: availableSeats(event, occupied) };
}

/** Published events ordered by start date, with available seats (R05) in a single query. */
export async function listPublishedEvents(): Promise<PublishedEvent[]> {
  const { rows } = await query<EventWithOccupied>(
    `SELECT e.*, ${OCCUPIED_SEATS_SQL} AS occupied FROM events e
      WHERE e.status = 'published' ORDER BY e.starts_at, e.id`,
  );
  return rows.map(withAvailability);
}

/** One published event with available seats, or null (draft, cancelled or missing). */
export async function getPublishedEvent(eventId: string): Promise<PublishedEvent | null> {
  const { rows } = await query<EventWithOccupied>(
    `SELECT e.*, ${OCCUPIED_SEATS_SQL} AS occupied FROM events e
      WHERE e.id = $1 AND e.status = 'published'`,
    [eventId],
  );
  return rows[0] ? withAvailability(rows[0]) : null;
}
