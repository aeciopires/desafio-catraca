// Row types shared by every feature (schema in src/db/migrations/001_init.sql).

export type Role = 'participant' | 'organizer';
export type EventStatus = 'draft' | 'published' | 'cancelled';
export type TicketStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'refunded';
export type SalesChannel = 'web' | 'partner';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
}

export interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  starts_at: Date;
  venue: string;
  capacity: number;
  price_cents: number;
  status: EventStatus;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  cancelled_at: Date | null;
}

export interface TicketRow {
  id: string;
  event_id: string;
  code: string;
  status: TicketStatus;
  checked_in: boolean;
  checked_in_at: Date | null;
  price_cents: number;
  channel: SalesChannel;
  buyer_user_id: string | null;
  buyer_email: string;
  partner_id: string | null;
  card_last4: string;
  created_at: Date;
  updated_at: Date;
}

/** Statuses that occupy a seat (R05). */
export const OCCUPYING_STATUSES: readonly TicketStatus[] = ['pending', 'confirmed'];
