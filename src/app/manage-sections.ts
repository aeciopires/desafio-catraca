// Extensible sections of the organizer's event management page (R04). F02 renders the page;
// check-in (F06), cancellation (F07) and dashboard (F08) plug in by filling their own file in
// src/app/sections/ (and their view) — without touching F02 files.
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { EventRow } from '../domain/types.ts';
import { centsToInput } from '../lib/money.ts';
import { toLocalInput } from '../lib/time.ts';
import { sections } from './sections/index.ts';

export interface ManageSection {
  id: string; // 'checkin' | 'cancellation' | 'dashboard'
  order: number; // render order on the page
  view: string; // EJS template path relative to src/app/views
  load(ctx: { event: EventRow; organizerId: string }): Promise<Record<string, unknown>>;
  register?(app: FastifyInstance): void; // extra POST routes (already behind requireOrganizer)
}

export interface RenderedSection {
  id: string;
  view: string;
  data: Record<string, unknown>;
}

export const STATUS_LABELS: Record<EventRow['status'], string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  cancelled: 'Cancelado',
};

const FLASH_MESSAGES: Record<string, string> = {
  updated: 'Evento atualizado.',
  published: 'Evento publicado.',
};

/** Edit-form values derived from the stored event. */
export function eventFormValues(event: EventRow): Record<string, string> {
  return {
    name: event.name,
    startsAt: toLocalInput(new Date(event.starts_at)),
    venue: event.venue,
    capacity: String(event.capacity),
    price: centsToInput(event.price_cents),
  };
}

/**
 * Renders the management page of an event the caller has ALREADY verified to be owned by the
 * current organizer (findOwnedEvent). `extras` may carry:
 * - `errors` (string[]) and `form` (edit-form values) for the edit form;
 * - `ok` (flash key: 'updated' | 'published') or `flash` (free flash message);
 * - anything a section wants to show (e.g. a check-in result) — sections receive `extras`
 *   merged under their own loaded data.
 */
export async function renderManagePage(
  reply: FastifyReply,
  event: EventRow,
  extras: Record<string, unknown> = {},
  statusCode = 200,
): Promise<FastifyReply> {
  const organizerId = event.organizer_id;
  const rendered: RenderedSection[] = [];
  for (const section of sections) {
    const data = await section.load({ event, organizerId });
    rendered.push({ id: section.id, view: section.view, data: { ...extras, ...data } });
  }
  const ok = typeof extras.ok === 'string' ? extras.ok : '';
  const flash =
    typeof extras.flash === 'string' && extras.flash ? extras.flash : (FLASH_MESSAGES[ok] ?? null);
  return reply.code(statusCode).view('organizer/manage.ejs', {
    title: event.name,
    event,
    statusLabel: STATUS_LABELS[event.status],
    flash,
    errors: Array.isArray(extras.errors) ? extras.errors : [],
    form: (extras.form as Record<string, string> | undefined) ?? eventFormValues(event),
    sections: rendered,
  });
}
