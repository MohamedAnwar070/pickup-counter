import { computeAvailable } from '../modules/inventory/inventory.repo';
import { mergeLineItems } from '../modules/orders/orders.schema';
import { decideWebhookOutcome, canTransition } from '../modules/payments/payments.schema';
import { verifySignature, signPayload } from './crypto/hmac';
import { secondsLeft } from './time/clock';
import { toPaise, formatRupees, paiseToRupees } from '@pickup-counter/shared';

describe('Unit Tests (G1 - G7)', () => {
  describe('G1: decideWebhookOutcome table-driven tests', () => {
    it('should return "paid" for captured payment within hold period', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: true,
        orderStatus: 'pending',
        orderTotalPaise: 35000,
        paidAmountPaise: 35000,
        isOrderExpired: false,
      });
      expect(res.outcome).toBe('paid');
    });

    it('should return "needs_review" with amount_mismatch if paid amount is lower', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: true,
        orderStatus: 'pending',
        orderTotalPaise: 35000,
        paidAmountPaise: 20000,
        isOrderExpired: false,
      });
      expect(res.outcome).toBe('needs_review');
      expect(res.reviewReason).toBe('amount_mismatch');
    });

    it('should return "needs_review" with amount_mismatch if paid amount is higher', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: true,
        orderStatus: 'pending',
        orderTotalPaise: 35000,
        paidAmountPaise: 50000,
        isOrderExpired: false,
      });
      expect(res.outcome).toBe('needs_review');
      expect(res.reviewReason).toBe('amount_mismatch');
    });

    it('should return "paid_late" for late payment when stock is still available', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: true,
        orderStatus: 'expired',
        orderTotalPaise: 35000,
        paidAmountPaise: 35000,
        isOrderExpired: true,
        hasEnoughStockForLatePayment: true,
      });
      expect(res.outcome).toBe('paid_late');
    });

    it('should return "needs_review" with refund_flag for late payment when stock is gone', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: true,
        orderStatus: 'expired',
        orderTotalPaise: 35000,
        paidAmountPaise: 35000,
        isOrderExpired: true,
        hasEnoughStockForLatePayment: false,
      });
      expect(res.outcome).toBe('needs_review');
      expect(res.reviewReason).toBe('late_payment_stock_gone');
      expect(res.refundFlag).toBe(true);
    });

    it('should return "ignored" if eventStatus is not captured (e.g. failed)', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'failed',
        orderExists: true,
        orderStatus: 'pending',
        orderTotalPaise: 35000,
        paidAmountPaise: 35000,
      });
      expect(res.outcome).toBe('ignored');
    });

    it('should return "ignored" if order does not exist', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: false,
      });
      expect(res.outcome).toBe('ignored');
    });

    it('should return "ignored" if order is already paid, picked_up, or needs_review', () => {
      expect(
        decideWebhookOutcome({
          eventStatus: 'captured',
          orderExists: true,
          orderStatus: 'paid',
          orderTotalPaise: 35000,
          paidAmountPaise: 35000,
        }).outcome,
      ).toBe('ignored');

      expect(
        decideWebhookOutcome({
          eventStatus: 'captured',
          orderExists: true,
          orderStatus: 'picked_up',
          orderTotalPaise: 35000,
          paidAmountPaise: 35000,
        }).outcome,
      ).toBe('ignored');

      expect(
        decideWebhookOutcome({
          eventStatus: 'captured',
          orderExists: true,
          orderStatus: 'needs_review',
          orderTotalPaise: 35000,
          paidAmountPaise: 35000,
        }).outcome,
      ).toBe('ignored');
    });

    it('should flag payment after cancellation for review and refund before amount checks', () => {
      const res = decideWebhookOutcome({
        eventStatus: 'captured',
        orderExists: true,
        orderStatus: 'cancelled',
        orderTotalPaise: 35000,
        paidAmountPaise: 1,
        isOrderExpired: false,
      });
      expect(res.outcome).toBe('needs_review');
      expect(res.reviewReason).toBe('payment_after_cancel');
      expect(res.refundFlag).toBe(true);
    });
  });

  describe('G2: verifySignature', () => {
    const secret = 'test-secret-12345';
    const body = Buffer.from('{"orderId":"abc","amount":100}', 'utf8');
    const validSignature = signPayload(body, secret);

    it('accepts correct signature', () => {
      expect(verifySignature(body, validSignature, secret)).toBe(true);
    });

    it('rejects wrong secret', () => {
      expect(verifySignature(body, validSignature, 'wrong-secret')).toBe(false);
    });

    it('rejects tampered body', () => {
      const tamperedBody = Buffer.from('{"orderId":"abc","amount":999}', 'utf8');
      expect(verifySignature(tamperedBody, validSignature, secret)).toBe(false);
    });

    it('rejects missing header', () => {
      expect(verifySignature(body, undefined, secret)).toBe(false);
    });

    it('rejects non-hex signature', () => {
      expect(verifySignature(body, 'not-a-hex-signature-12345-xyz!', secret)).toBe(false);
    });

    it('rejects wrong length signature', () => {
      expect(verifySignature(body, 'abcd1234ef', secret)).toBe(false);
    });
  });

  describe('G3: secondsLeft', () => {
    it('returns positive integer for future expiry', () => {
      const now = new Date('2026-10-22T10:00:00Z');
      const expiresAt = new Date('2026-10-22T10:02:00Z'); // 120s later
      expect(secondsLeft(expiresAt, now)).toBe(120);
    });

    it('returns 0 when now equals expiresAt', () => {
      const now = new Date('2026-10-22T10:00:00Z');
      expect(secondsLeft(now, now)).toBe(0);
    });

    it('returns 0 when expiry is in the past', () => {
      const now = new Date('2026-10-22T10:05:00Z');
      const expiresAt = new Date('2026-10-22T10:00:00Z');
      expect(secondsLeft(expiresAt, now)).toBe(0);
    });
  });

  describe('G4: computeAvailable', () => {
    it('computes stock minus held units correctly', () => {
      expect(computeAvailable(10, 3)).toBe(7);
      expect(computeAvailable(10, 0)).toBe(10);
      expect(computeAvailable(5, 5)).toBe(0);
    });

    it('clamps to 0 when held exceeds stock', () => {
      expect(computeAvailable(5, 8)).toBe(0);
    });
  });

  describe('G5: mergeLineItems', () => {
    it('merges duplicate product IDs and sums quantities', () => {
      const input = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
        { productId: 1, quantity: 3 },
      ];
      const merged = mergeLineItems(input);
      expect(merged).toEqual([
        { productId: 1, quantity: 5 },
        { productId: 2, quantity: 1 },
      ]);
    });

    it('preserves list when there are no duplicates', () => {
      const input = [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 3 },
      ];
      expect(mergeLineItems(input)).toEqual(input);
    });
  });

  describe('G6: canTransition', () => {
    it('allows pending -> paid, expired, needs_review', () => {
      expect(canTransition('pending', 'paid')).toBe(true);
      expect(canTransition('pending', 'expired')).toBe(true);
      expect(canTransition('pending', 'needs_review')).toBe(true);
      expect(canTransition('pending', 'picked_up')).toBe(false);
    });

    it('allows expired -> paid, needs_review for late payments', () => {
      expect(canTransition('expired', 'paid')).toBe(true);
      expect(canTransition('expired', 'needs_review')).toBe(true);
      expect(canTransition('expired', 'picked_up')).toBe(false);
    });

    it('allows paid -> picked_up', () => {
      expect(canTransition('paid', 'picked_up')).toBe(true);
      expect(canTransition('paid', 'expired')).toBe(false);
      expect(canTransition('paid', 'needs_review')).toBe(false);
    });

    it('allows pending -> cancelled, but nothing leaves cancelled', () => {
      expect(canTransition('pending', 'cancelled')).toBe(true);
      expect(canTransition('cancelled', 'pending')).toBe(false);
      expect(canTransition('cancelled', 'paid')).toBe(false);
      expect(canTransition('cancelled', 'needs_review')).toBe(false);
    });

    it('disallows transitions out of picked_up or needs_review', () => {
      expect(canTransition('picked_up', 'paid')).toBe(false);
      expect(canTransition('picked_up', 'pending')).toBe(false);
      expect(canTransition('needs_review', 'paid')).toBe(false);
    });
  });

  describe('G7: money helpers', () => {
    it('converts decimal rupees to integer paise without float drift', () => {
      expect(toPaise(10.5)).toBe(1050);
      expect(toPaise(0.01)).toBe(1);
      expect(toPaise(19.99)).toBe(1999);
      expect(toPaise(350)).toBe(35000);
    });

    it('converts paise to rupees', () => {
      expect(paiseToRupees(35000)).toBe(350);
      expect(paiseToRupees(1234)).toBe(12.34);
    });

    it('formats rupees with currency symbol and 2 decimals', () => {
      const formatted = formatRupees(35000);
      expect(formatted).toContain('350.00');
    });
  });
});
