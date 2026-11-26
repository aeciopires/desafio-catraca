// Simulated payment gateway (R08): the last 4 digits of the card decide the outcome and the delay.
import { config } from '../config.ts';
import type { PaymentDecision, PaymentGateway, PaymentResult } from './payment-gateway.ts';

export interface SimulatedRule {
  decision: PaymentDecision;
  minMs: number;
  maxMs: number;
}

/** Table from the brief (delays inside the brief's ranges, with slack for the worker polling). */
export const SIMULATED_RULES: Readonly<Record<string, SimulatedRule>> = {
  '0001': { decision: 'approved', minMs: 2000, maxMs: 4500 },
  '0002': { decision: 'declined', minMs: 2000, maxMs: 4500 },
  '0003': { decision: 'approved', minMs: 30000, maxMs: 39000 },
  '0004': { decision: 'declined', minMs: 30000, maxMs: 39000 },
};

/** Any other card ending: declined quickly. */
export const DEFAULT_RULE: SimulatedRule = { decision: 'declined', minMs: 2000, maxMs: 4500 };

export function ruleForCard(cardNumber: string): SimulatedRule {
  return SIMULATED_RULES[cardNumber.slice(-4)] ?? DEFAULT_RULE;
}

/**
 * Pure decision function. `random` returns a number in [0, 1) and `scale` multiplies the delay
 * (GATEWAY_DELAY_SCALE; integration tests use 0.1).
 */
export function simulateDecision(
  cardNumber: string,
  scale: number,
  random: () => number = Math.random,
): PaymentResult {
  const rule = ruleForCard(cardNumber);
  const base = rule.minMs + Math.floor(random() * (rule.maxMs - rule.minMs + 1));
  return { decision: rule.decision, delayMs: Math.round(base * scale) };
}

export const simulatedGateway: PaymentGateway = {
  submit({ cardNumber }) {
    return simulateDecision(cardNumber, config.gatewayDelayScale);
  },
};
