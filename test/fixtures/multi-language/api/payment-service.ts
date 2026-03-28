import { Order, PaymentResult } from '../shared/types';
import { stripe } from './stripe-client';

/**
 * Payment processing service.
 * @tags: payment, billing
 * @deps: stripe-client.charge
 */
export class PaymentService {
  constructor(private apiKey: string) {}

  /**
   * Process a payment for an order.
   * @deps: stripe.charge
   * @side_effects: external_api, database_write
   * @tags: payment
   */
  async processPayment(order: Order): Promise<PaymentResult> {
    const amount = this.calculateTotal(order);
    return await stripe.charge(amount, this.apiKey);
  }

  private calculateTotal(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.price, 0);
  }
}

/**
 * Format currency for display.
 * @tags: display, formatting
 */
export const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

export function validateOrder(order: Order): boolean {
  return order.items.length > 0 && order.total > 0;
}
