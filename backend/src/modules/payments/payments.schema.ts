import { z } from 'zod';
import { OrderStatus, WebhookOutcome, ReviewReason } from '../../common';

export const webhookPayloadSchema = z
  .object({
    eventId: z.string().optional(),
    event_id: z.string().optional(),
    orderId: z.string().optional(),
    order_id: z.string().optional(),
    amountPaise: z.number().int().nonnegative().optional(),
    amount_paise: z.number().int().nonnegative().optional(),
    status: z.string(),
  })
  .refine((data) => !!(data.eventId || data.event_id), {
    message: 'Either eventId or event_id must be provided',
    path: ['eventId'],
  })
  .refine((data) => !!(data.orderId || data.order_id), {
    message: 'Either orderId or order_id must be provided',
    path: ['orderId'],
  })
  .refine((data) => data.amountPaise !== undefined || data.amount_paise !== undefined, {
    message: 'Either amountPaise or amount_paise must be provided',
    path: ['amountPaise'],
  });

export type NormalizedWebhookPayload = {
  eventId: string;
  orderId: string;
  amountPaise: number;
  status: string;
};

export function normalizeWebhookPayload(body: unknown): NormalizedWebhookPayload {
  const parsed = webhookPayloadSchema.parse(body);
  return {
    eventId: (parsed.eventId || parsed.event_id)!,
    orderId: (parsed.orderId || parsed.order_id)!,
    amountPaise: (parsed.amountPaise !== undefined ? parsed.amountPaise : parsed.amount_paise)!,
    status: parsed.status,
  };
}

export interface WebhookDecisionInput {
  eventStatus: string;
  orderExists: boolean;
  orderStatus?: OrderStatus;
  orderTotalPaise?: number;
  paidAmountPaise?: number;
  isOrderExpired?: boolean;
  hasEnoughStockForLatePayment?: boolean;
}

export interface WebhookDecisionResult {
  outcome: WebhookOutcome;
  reviewReason?: ReviewReason;
  refundFlag?: boolean;
}

/**
 * Pure function: table-driven decision logic for webhook handling.
 */
export function decideWebhookOutcome(input: WebhookDecisionInput): WebhookDecisionResult {
  // If order does not exist or payment status is not 'captured'
  if (!input.orderExists || input.eventStatus !== 'captured') {
    return { outcome: 'ignored' };
  }

  // If order is already in a terminal/immutable state
  if (
    input.orderStatus === 'paid' ||
    input.orderStatus === 'picked_up' ||
    input.orderStatus === 'needs_review'
  ) {
    return { outcome: 'ignored' };
  }

  // A captured payment after an explicit cancellation must be reviewed and
  // refunded rather than silently kept or used to revive the order.
  if (input.orderStatus === 'cancelled') {
    return {
      outcome: 'needs_review',
      reviewReason: 'payment_after_cancel',
      refundFlag: true,
    };
  }

  // Check amount mismatch
  if (
    input.orderTotalPaise !== undefined &&
    input.paidAmountPaise !== undefined &&
    input.orderTotalPaise !== input.paidAmountPaise
  ) {
    return {
      outcome: 'needs_review',
      reviewReason: 'amount_mismatch',
    };
  }

  // Order is pending and NOT expired
  if (input.orderStatus === 'pending' && !input.isOrderExpired) {
    return { outcome: 'paid' };
  }

  // Late payment (order was expired, or pending but past expiry)
  if (input.hasEnoughStockForLatePayment) {
    return { outcome: 'paid_late' };
  }

  return {
    outcome: 'needs_review',
    reviewReason: 'late_payment_stock_gone',
    refundFlag: true,
  };
}

/**
 * Pure function: verifies valid state machine transitions.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;

  switch (from) {
    case 'pending':
      return to === 'paid' || to === 'expired' || to === 'needs_review' || to === 'cancelled';
    case 'expired':
      return to === 'paid' || to === 'needs_review';
    case 'paid':
      return to === 'picked_up';
    case 'needs_review':
    case 'picked_up':
    case 'cancelled':
      return false;
    default:
      return false;
  }
}
