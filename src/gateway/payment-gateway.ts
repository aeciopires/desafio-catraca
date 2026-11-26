// Payment gateway port (R08). The simulated gateway is the only implementation in the MVP;
// a real gateway would implement the same interface and be selected by config.gatewayMode.
import { config } from '../config.ts';
import { simulatedGateway } from './simulated-gateway.ts';

export type PaymentDecision = 'approved' | 'declined';

export interface PaymentRequest {
  ticketId: string;
  cardNumber: string;
}

export interface PaymentResult {
  decision: PaymentDecision;
  /** How long after submission the decision becomes effective (applied by the worker). */
  delayMs: number;
}

export interface PaymentGateway {
  submit(req: PaymentRequest): PaymentResult;
}

/** Returns the configured gateway (always the simulated one: config.gatewayMode === 'simulated'). */
export function getGateway(): PaymentGateway {
  if (config.gatewayMode !== 'simulated') {
    throw new Error(`[ERRO][CFG-002] GATEWAY_MODE="${config.gatewayMode}" não suportado.`);
  }
  return simulatedGateway;
}
