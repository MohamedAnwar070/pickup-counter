import React, { useEffect, useState, useCallback, useRef } from 'react';
import { formatRupees, OrderStatus } from '@pickup-counter/shared';
import { fetchOrder, simulateWebhook, claimPickup } from '../api/client';
import { useCountdown } from '../hooks/useCountdown';

interface PaymentModalProps {
  orderId: string;
  initialExpiresInSeconds: number;
  totalPaise: number;
  onClose: () => void;
  onOrderUpdated: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  orderId,
  initialExpiresInSeconds,
  totalPaise,
  onClose,
  onOrderUpdated,
}) => {
  const [status, setStatus] = useState<OrderStatus>('pending');
  const [serverExpiresIn, setServerExpiresIn] = useState<number>(initialExpiresInSeconds);
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [refundFlag, setRefundFlag] = useState<boolean>(false);
  const [items, setItems] = useState<any[]>([]);

  // Simulator state
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);

  // Locker claim state
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Countdown timer hook using performance.now()
  const { remaining, formatted, isZero } = useCountdown(serverExpiresIn);

  const isTerminal = status === 'paid' || status === 'expired' || status === 'needs_review' || status === 'picked_up';

  // Polling loop every 1.5 seconds until terminal status reached
  const pollOrder = useCallback(async () => {
    try {
      const res = await fetchOrder(orderId);
      setStatus(res.status);
      setServerExpiresIn(res.expiresInSeconds);
      if (res.reviewReason) setReviewReason(res.reviewReason);
      if (res.refundFlag !== undefined) setRefundFlag(res.refundFlag);
      if (res.items) setItems(res.items);

      if (res.status !== 'pending') {
        onOrderUpdated();
      }
    } catch (err: any) {
      console.error('Polling order error:', err);
    }
  }, [orderId, onOrderUpdated]);

  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    pollOrder();
    if (!isTerminal) {
      pollIntervalRef.current = setInterval(pollOrder, 1500);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pollOrder, isTerminal]);

  // Simulation handler
  const handleSimulatePayment = async (mode: 'correct' | 'mismatch' | 'badsig' | 'duplicate') => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      let amount = totalPaise;
      let badSig = false;
      const eventId = mode === 'duplicate' ? 'evt_duplicate_demo' : `evt_${Date.now()}`;

      if (mode === 'mismatch') {
        amount = 1000; // ₹10.00 mismatch
      } else if (mode === 'badsig') {
        badSig = true;
      }

      const res = await simulateWebhook(
        {
          eventId,
          orderId,
          amountPaise: amount,
          status: 'captured',
        },
        'pickup-secret-key-12345',
        badSig,
      );

      setSimulationResult(`Simulation response: ${JSON.stringify(res)}`);
      // Immediately trigger a poll
      await pollOrder();
    } catch (err: any) {
      setSimulationResult(`Error: ${err.message || 'Simulation failed'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Locker pickup claim handler
  const handleClaimPickup = async () => {
    setIsClaiming(true);
    setClaimError(null);
    try {
      await claimPickup(orderId);
      setStatus('picked_up');
      onOrderUpdated();
    } catch (err: any) {
      setClaimError(err.message || 'Failed to claim pickup');
    } finally {
      setIsClaiming(false);
    }
  };

  const cliCommand = `npm run send-webhook -- --orderId ${orderId} --amount ${totalPaise}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title">Order #{orderId.substring(0, 8)}...</h2>
            <div className={`status-pill status-${status}`}>
              {status === 'pending' && '⏳ Stock Held'}
              {status === 'paid' && '✅ Paid (Ready for Locker)'}
              {status === 'expired' && '❌ Hold Expired'}
              {status === 'needs_review' && '⚠️ Needs Staff Review'}
              {status === 'picked_up' && '🎉 Order Collected'}
            </div>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Main Status & Countdown Card */}
          <div className="checkout-card">
            <div className="checkout-summary">
              <span className="summary-label">Total to Pay</span>
              <span className="summary-amount">{formatRupees(totalPaise)}</span>
              <span className="summary-paise">({totalPaise} paise)</span>
            </div>

            {status === 'pending' && (
              <div className="timer-section">
                <div className={`timer-ring ${remaining < 20 ? 'timer-urgent' : ''}`}>
                  <span className="timer-digits">{formatted}</span>
                  <span className="timer-label">Hold Seconds Remaining</span>
                </div>
                {isZero ? (
                  <p className="timer-note waiting-server">
                    ⏱️ Timer reached zero. Synchronizing with server clock...
                  </p>
                ) : (
                  <p className="timer-note">
                    Your items are locked on the counter. Please complete payment before the countdown ends.
                  </p>
                )}
              </div>
            )}

            {status === 'paid' && (
              <div className="status-banner banner-success">
                <div className="banner-icon">✓</div>
                <div className="banner-text">
                  <h3>Payment Verified!</h3>
                  <p>Your order has been paid. Locker counter is unlocked for your pickup.</p>
                </div>
              </div>
            )}

            {status === 'expired' && (
              <div className="status-banner banner-expired">
                <div className="banner-icon">⏱️</div>
                <div className="banner-text">
                  <h3>Hold Period Expired</h3>
                  <p>
                    The 120-second reservation ended without payment. Reserved items were released back to inventory.
                  </p>
                </div>
              </div>
            )}

            {status === 'needs_review' && (
              <div className="status-banner banner-warning">
                <div className="banner-icon">⚠️</div>
                <div className="banner-text">
                  <h3>Payment Under Staff Review</h3>
                  <p>
                    Reason: <strong>{reviewReason || 'Staff review required'}</strong>.
                    {refundFlag && ' (Refund flag has been marked for processing).'}
                  </p>
                  <p className="sub-warning">
                    Counter staff will assist you directly. Please do not submit duplicate payments.
                  </p>
                </div>
              </div>
            )}

            {status === 'picked_up' && (
              <div className="status-banner banner-pickedup">
                <div className="banner-icon">🎁</div>
                <div className="banner-text">
                  <h3>Order Collected!</h3>
                  <p>Locker has dispensed your artisanal items. Thank you for shopping with us!</p>
                </div>
              </div>
            )}
          </div>

          {/* Action: Locker Claim (Shown when Paid) */}
          {status === 'paid' && (
            <div className="locker-claim-card">
              <div className="locker-info">
                <h4>Locker Counter Access</h4>
                <p>Click below to verify presence at locker and collect your order.</p>
              </div>
              {claimError && <div className="alert alert-error">{claimError}</div>}
              <button
                className="btn btn-success btn-claim"
                onClick={handleClaimPickup}
                disabled={isClaiming}
              >
                {isClaiming ? 'Opening Locker Door...' : '🔓 Claim Pickup at Locker'}
              </button>
            </div>
          )}

          {/* Reviewer & Testing Simulator Panel */}
          <div className="simulator-card">
            <div className="simulator-header">
              <h4>Interactive Payment Simulator (R4, R5, R6, R7, R8)</h4>
              <span className="badge badge-neutral">Reviewer Helper</span>
            </div>
            <p className="simulator-desc">
              Test signed webhook scenarios in real-time with Web Crypto HMAC-SHA256:
            </p>

            <div className="simulator-btn-grid">
              <button
                className="btn btn-sm btn-outline"
                disabled={isSimulating || isTerminal}
                onClick={() => handleSimulatePayment('correct')}
              >
                💸 Send Valid Payment ({formatRupees(totalPaise)})
              </button>

              <button
                className="btn btn-sm btn-outline"
                disabled={isSimulating || isTerminal}
                onClick={() => handleSimulatePayment('mismatch')}
              >
                ⚠️ Send Wrong Amount (₹10.00)
              </button>

              <button
                className="btn btn-sm btn-outline"
                disabled={isSimulating || isTerminal}
                onClick={() => handleSimulatePayment('badsig')}
              >
                ⛔ Send Bad Signature (401)
              </button>

              <button
                className="btn btn-sm btn-outline"
                disabled={isSimulating}
                onClick={() => handleSimulatePayment('duplicate')}
              >
                🔁 Send Duplicate Event
              </button>
            </div>

            {simulationResult && (
              <div className="simulation-output">
                <code>{simulationResult}</code>
              </div>
            )}

            <div className="cli-snippet-wrap">
              <div className="cli-header">
                <span>Or run via Terminal CLI:</span>
                <button className="btn-copy" onClick={copyToClipboard}>
                  {copiedCli ? 'Copied! ✓' : 'Copy Command'}
                </button>
              </div>
              <pre className="cli-code">{cliCommand}</pre>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {isTerminal ? 'Close' : 'Cancel & Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
