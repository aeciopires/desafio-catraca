// Ticket queries shared by the showcase (F04), partner API (F05), check-in (F06) and dashboard.
import { query } from '../db/pool.ts';
import type { TicketRow, TicketStatus } from './types.ts';

/** pt-BR labels shown to users for each ticket status. */
export const TICKET_STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  pending: 'pendente',
  confirmed: 'confirmado',
  declined: 'recusado',
  cancelled: 'cancelado',
  refunded: 'estornado',
};

export interface UserTicketRow extends TicketRow {
  event_name: string;
  event_starts_at: Date;
}

export async function findTicketById(id: string): Promise<TicketRow | null> {
  const { rows } = await query<TicketRow>('SELECT * FROM tickets WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** Looks a ticket up by its 8-character code (case-insensitive, surrounding spaces ignored). */
export async function findTicketByCode(code: string): Promise<TicketRow | null> {
  const normalized = code.trim().toUpperCase();
  if (normalized === '') return null;
  const { rows } = await query<TicketRow>('SELECT * FROM tickets WHERE code = $1', [normalized]);
  return rows[0] ?? null;
}

/** Tickets bought by a user, with event name and date, newest first. */
export async function listTicketsForUser(userId: string): Promise<UserTicketRow[]> {
  const { rows } = await query<UserTicketRow>(
    `SELECT t.*, e.name AS event_name, e.starts_at AS event_starts_at
       FROM tickets t
       JOIN events e ON e.id = t.event_id
      WHERE t.buyer_user_id = $1
      ORDER BY t.created_at DESC, t.id DESC`,
    [userId],
  );
  return rows;
}
