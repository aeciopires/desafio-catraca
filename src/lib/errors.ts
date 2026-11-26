// Domain errors carry a stable machine-readable code; routes map codes to HTTP/UI responses.

export type DomainErrorCode =
  | 'not_found'
  | 'validation_failed'
  | 'invalid_card'
  | 'event_not_available'
  | 'sold_out'
  | 'event_cancelled'
  | 'capacity_below_occupied'
  | 'not_cancellable'
  | 'email_taken'
  | 'invalid_credentials';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: string[];

  constructor(code: DomainErrorCode, message?: string, details: string[] = []) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(err: unknown, code?: DomainErrorCode): err is DomainError {
  return err instanceof DomainError && (code === undefined || err.code === code);
}
