// Event cancellation (R11). Skeleton — implemented in the next commit.
import { DomainError } from '../lib/errors.ts';

export interface CancellationResult {
  refunded: number;
  cancelled: number;
}

export async function cancelEvent(
  _organizerId: string,
  _eventId: string,
): Promise<CancellationResult> {
  throw new DomainError('not_cancellable', 'Not implemented yet');
}
