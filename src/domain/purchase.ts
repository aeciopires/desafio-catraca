// Purchase core (R03, R05, R06, R07, R08, R09): the single path that creates tickets.
import type { SalesChannel, TicketRow } from './types.ts';

export interface PurchaseInput {
  eventId: string;
  channel: SalesChannel;
  buyerEmail: string;
  buyerUserId?: string | null;
  partnerId?: string | null;
  cardNumber: string;
}

export async function purchaseTicket(_input: PurchaseInput): Promise<TicketRow> {
  throw new Error('not implemented');
}
