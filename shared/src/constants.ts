export const HOLD_SECONDS = 120;

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'expired',
  'needs_review',
  'picked_up',
] as const;

export const WEBHOOK_OUTCOMES = [
  'paid',
  'paid_late',
  'needs_review',
  'ignored',
] as const;

export const REVIEW_REASONS = {
  AMOUNT_MISMATCH: 'amount_mismatch',
  LATE_PAYMENT_STOCK_GONE: 'late_payment_stock_gone',
} as const;

export const ERROR_CODES = {
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  INVALID_UUID: 'INVALID_UUID',
  ALREADY_CLAIMED: 'ALREADY_CLAIMED',
  NOT_CLAIMABLE: 'NOT_CLAIMABLE',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
