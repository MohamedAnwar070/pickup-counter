import React, { useEffect, useState, useCallback, useRef } from 'react';
import { formatRupees, OrderStatus } from '@pickup-counter/shared';
import { fetchOrder, simulateWebhook, claimPickup } from '../api/client';
import { useCountdown } from '../hooks/useCountdown';
import { sound } from '../utils/audio';

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

  // Realistic payment methods
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'counter'>('upi');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [cardNumber, setCardNumber] = useState<string>('4532 8920 1142 8820');
  const [cardExpiry, setCardExpiry] = useState<string>('08/29');
  const [cardCvv, setCardCvv] = useState<string>('724');

  // Locker claim state
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [lockerOpened, setLockerOpened] = useState<boolean>(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Reviewer drawer state
  const [showDevTools, setShowDevTools] = useState<boolean>(false);
  const [devResult, setDevResult] = useState<string | null>(null);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);

  // Countdown timer hook using performance.now()
  const { remaining, formatted, isZero, percentage } = useCountdown(serverExpiresIn);

  const isTerminal = status === 'paid' || status === 'expired' || status === 'needs_review' || status === 'picked_up';

  // Order poller
  const pollOrder = useCallback(async () => {
    try {
      const res = await fetchOrder(orderId);
      const prevStatus = status;
      setStatus(res.status);
      setServerExpiresIn(res.expiresInSeconds);
      if (res.reviewReason) setReviewReason(res.reviewReason);
      if (res.refundFlag !== undefined) setRefundFlag(res.refundFlag);
      if (res.items) setItems(res.items);

      // Play success chime on transition to paid
      if (prevStatus === 'pending' && res.status === 'paid') {
        sound.playPaymentSuccess();
      }

      if (res.status !== 'pending') {
        onOrderUpdated();
      }
    } catch (err: any) {
      console.error('Polling error:', err);
    }
  }, [orderId, status, onOrderUpdated]);

  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    pollOrder();
    if (!isTerminal) {
      pollIntervalRef.current = window.setInterval(pollOrder, 1200);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pollOrder, isTerminal]);

  // Customer Simulated Payment (Triggering the signed webhook)
  const handleCustomerPay = async () => {
    setIsProcessingPayment(true);
    setDevResult(null);
    try {
      const eventId = `evt_cust_${Date.now()}`;
      await simulateWebhook({
        eventId,
        orderId,
        amountPaise: totalPaise,
        status: 'captured',
      });
      // Sound chime and immediate poll
      sound.playPaymentSuccess();
      await pollOrder();
    } catch (err: any) {
      console.error('Payment error:', err);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Locker pickup claim
  const handleOpenLocker = async () => {
    setIsClaiming(true);
    setClaimError(null);
    try {
      await claimPickup(orderId);
      sound.playLockerUnlock();
      setLockerOpened(true);
      setStatus('picked_up');
      onOrderUpdated();
    } catch (err: any) {
      setClaimError(err.message || 'Could not claim locker pickup');
    } finally {
      setIsClaiming(false);
    }
  };

  // Developer / Reviewer simulated test triggers
  const handleDevWebhook = async (mode: 'mismatch' | 'badsig' | 'duplicate') => {
    setDevResult(null);
    try {
      let amount = totalPaise;
      let badSig = false;
      const eventId = mode === 'duplicate' ? 'evt_duplicate_test' : `evt_test_${Date.now()}`;

      if (mode === 'mismatch') amount = 1000;
      if (mode === 'badsig') badSig = true;

      const res = await simulateWebhook(
        { eventId, orderId, amountPaise: amount, status: 'captured' },
        'pickup-secret-key-12345',
        badSig,
      );
      setDevResult(`Outcome: ${JSON.stringify(res)}`);
      await pollOrder();
    } catch (err: any) {
      setDevResult(`Rejection: ${err.message}`);
    }
  };

  const shortId = orderId.substring(0, 8).toUpperCase();
  const lockerBay = `Bay 04`;
  const cliCommand = `npm run send-webhook -- --orderId ${orderId} --amount ${totalPaise}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="locker-badge">
              <span className="locker-icon">🔐</span>
              <span>{lockerBay}</span>
            </div>
            <div>
              <h2 className="modal-title">Pickup Reservation #{shortId}</h2>
              <span className="modal-subheading">MetroSober Counter Locker Dispatch</span>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Reservation Hold Timer Strip (Only when Pending) */}
          {status === 'pending' && (
            <div className="hold-timer-strip">
              <div className="hold-timer-info">
                <div className="timer-countdown-badge">
                  <span className="pulse-dot"></span>
                  <span className="timer-text">{formatted}</span>
                </div>
                <span className="hold-statement">
                  Items held exclusively at the counter. Reservation expires in{' '}
                  <strong>{remaining}s</strong>.
                </span>
              </div>
              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill ${remaining < 25 ? 'fill-urgent' : ''}`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* STATE 1: PENDING PAYMENT (Realistic Checkout Flow)           */}
          {/* ──────────────────────────────────────────────────────────── */}
          {status === 'pending' && (
            <div className="checkout-terminal">
              <div className="order-receipt-summary">
                <div className="receipt-header">
                  <span className="receipt-label">Total Payable</span>
                  <span className="receipt-amount">{formatRupees(totalPaise)}</span>
                </div>
                <p className="receipt-paise-note">Integer Accounting: {totalPaise} paise</p>
              </div>

              {/* Payment Method Tabs */}
              <div className="payment-method-tabs">
                <button
                  className={`method-tab ${paymentMethod === 'upi' ? 'is-active' : ''}`}
                  onClick={() => setPaymentMethod('upi')}
                >
                  <span className="tab-icon">⚡</span>
                  <span className="tab-text">UPI QR Code</span>
                </button>
                <button
                  className={`method-tab ${paymentMethod === 'card' ? 'is-active' : ''}`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <span className="tab-icon">💳</span>
                  <span className="tab-text">Debit / Credit Card</span>
                </button>
                <button
                  className={`method-tab ${paymentMethod === 'counter' ? 'is-active' : ''}`}
                  onClick={() => setPaymentMethod('counter')}
                >
                  <span className="tab-icon">🏪</span>
                  <span className="tab-text">Counter Staff</span>
                </button>
              </div>

              {/* Method 1: Realistic UPI QR Scanner */}
              {paymentMethod === 'upi' && (
                <div className="upi-payment-panel">
                  <div className="qr-code-wrapper">
                    {/* Realistic SVG UPI QR Code representation */}
                    <div className="qr-card">
                      <svg width="150" height="150" viewBox="0 0 100 100" className="upi-qr-svg">
                        <rect width="100" height="100" fill="#FFFFFF" rx="6" />
                        <rect x="8" y="8" width="28" height="28" fill="#24211D" />
                        <rect x="12" y="12" width="20" height="20" fill="#FFFFFF" />
                        <rect x="16" y="16" width="12" height="12" fill="#932D2C" />

                        <rect x="64" y="8" width="28" height="28" fill="#24211D" />
                        <rect x="68" y="12" width="20" height="20" fill="#FFFFFF" />
                        <rect x="72" y="16" width="12" height="12" fill="#932D2C" />

                        <rect x="8" y="64" width="28" height="28" fill="#24211D" />
                        <rect x="12" y="68" width="20" height="20" fill="#FFFFFF" />
                        <rect x="16" y="72" width="12" height="12" fill="#932D2C" />

                        {/* QR Matrix elements */}
                        <circle cx="50" cy="20" r="4" fill="#24211D" />
                        <circle cx="50" cy="50" r="6" fill="#932D2C" />
                        <circle cx="50" cy="80" r="4" fill="#24211D" />
                        <rect x="42" y="32" width="6" height="6" fill="#24211D" />
                        <rect x="52" y="38" width="6" height="6" fill="#24211D" />
                        <rect x="72" y="52" width="8" height="8" fill="#24211D" />
                        <rect x="82" y="66" width="6" height="6" fill="#24211D" />
                        <rect x="68" y="76" width="8" height="8" fill="#24211D" />
                        <rect x="80" y="82" width="6" height="6" fill="#24211D" />
                      </svg>
                      <span className="qr-brand-label">GPay · PhonePe · Paytm</span>
                    </div>

                    <div className="upi-instructions">
                      <h4>Scan with Any UPI App</h4>
                      <p>
                        Point your camera at this QR code to complete payment of{' '}
                        <strong>{formatRupees(totalPaise)}</strong> before the 120s hold expires.
                      </p>
                      <div className="upi-id-pill">
                        <code>metrosober.counter@icici</code>
                      </div>
                      <button
                        className="btn btn-primary btn-customer-action"
                        onClick={handleCustomerPay}
                        disabled={isProcessingPayment || isZero}
                      >
                        {isProcessingPayment ? (
                          <>
                            <span className="spinner"></span> Authorizing UPI Transfer...
                          </>
                        ) : (
                          <>📱 Tap to Pay on Phone (Simulate Customer Scan)</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Method 2: Card Terminal */}
              {paymentMethod === 'card' && (
                <div className="card-payment-panel">
                  <div className="form-group">
                    <label>Card Number</label>
                    <input
                      type="text"
                      className="input"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Valid Thru</label>
                      <input
                        type="text"
                        className="input"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>CVV</label>
                      <input
                        type="password"
                        className="input"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-customer-action"
                    onClick={handleCustomerPay}
                    disabled={isProcessingPayment || isZero}
                  >
                    {isProcessingPayment ? 'Connecting to Bank Gateway...' : `Authorize ${formatRupees(totalPaise)}`}
                  </button>
                </div>
              )}

              {/* Method 3: Counter Staff */}
              {paymentMethod === 'counter' && (
                <div className="counter-staff-panel">
                  <div className="staff-icon">🏪</div>
                  <h4>Cash Payment at Counter Station</h4>
                  <p>
                    Please inform the counter attendant of your Order ID <strong>#{shortId}</strong>.
                    Once cash is received, staff will trigger the terminal verification.
                  </p>
                  <button
                    className="btn btn-secondary btn-customer-action"
                    onClick={handleCustomerPay}
                    disabled={isProcessingPayment || isZero}
                  >
                    {isProcessingPayment ? 'Staff Confirming...' : 'Clerk: Confirm Cash Received'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* STATE 2: PAID (Ready for Locker Pickup)                      */}
          {/* ──────────────────────────────────────────────────────────── */}
          {status === 'paid' && (
            <div className="locker-ready-experience">
              <div className="success-hero-banner">
                <div className="success-badge-pulse">✓</div>
                <h3>Payment Successfully Received!</h3>
                <p>
                  Your payment of <strong>{formatRupees(totalPaise)}</strong> has been verified.
                  Locker compartment #{shortId.substring(0, 2)} is unlocked and waiting for pickup.
                </p>
              </div>

              <div className="locker-door-graphic">
                <div className="locker-visual-door">
                  <div className="locker-display-screen">
                    <span className="locker-number-tag">LOCKER #04</span>
                    <span className="locker-status-tag">STATUS: READY FOR COLLECTION</span>
                  </div>
                  <div className="locker-handle"></div>
                </div>

                <div className="pickup-action-box">
                  <h4>Counter Collection Station</h4>
                  <p>Walk up to Locker Bay 04 and press below to pop the locker door.</p>
                  {claimError && <div className="alert alert-error">{claimError}</div>}
                  <button
                    className="btn btn-success btn-large-claim"
                    onClick={handleOpenLocker}
                    disabled={isClaiming}
                  >
                    {isClaiming ? 'Unlatching Locker Door...' : '🔓 Pop Locker Door & Claim Goods'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* STATE 3: PICKED UP (Digital Customer Receipt)                */}
          {/* ──────────────────────────────────────────────────────────── */}
          {status === 'picked_up' && (
            <div className="pickup-complete-experience">
              <div className="collected-header">
                <span className="trophy-emoji">🎁</span>
                <h3>Order Collected Successfully!</h3>
                <p>Items have been dispensed from Locker Bay 04. Thank you for choosing MetroSober.</p>
              </div>

              <div className="digital-receipt-card">
                <div className="receipt-top-bar">
                  <span className="receipt-brand">METROSOBER ARTISANAL DISPATCH</span>
                  <span className="receipt-date">{new Date().toLocaleDateString('en-IN')}</span>
                </div>
                <div className="receipt-meta-grid">
                  <div>
                    <span className="meta-k">Order Ref:</span>
                    <span className="meta-v">#{orderId}</span>
                  </div>
                  <div>
                    <span className="meta-k">Locker:</span>
                    <span className="meta-v">Bay 04 (Dispensed)</span>
                  </div>
                  <div>
                    <span className="meta-k">Payment:</span>
                    <span className="meta-v">Verified (HMAC-SHA256)</span>
                  </div>
                </div>

                <div className="receipt-divider"></div>

                <div className="receipt-lines">
                  {items.map((it, idx) => (
                    <div key={idx} className="receipt-line">
                      <span>
                        {it.name} × {it.quantity}
                      </span>
                      <span>{formatRupees(it.unitPricePaise * it.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="receipt-divider"></div>

                <div className="receipt-total-line">
                  <span>Grand Total</span>
                  <span className="receipt-total-val">{formatRupees(totalPaise)}</span>
                </div>
              </div>

              <button className="btn btn-secondary btn-full" onClick={onClose}>
                Return to Counter Catalog
              </button>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* STATE 4: EXPIRED                                             */}
          {/* ──────────────────────────────────────────────────────────── */}
          {status === 'expired' && (
            <div className="status-banner banner-expired">
              <div className="banner-icon">⏱️</div>
              <div className="banner-text">
                <h3>120-Second Reservation Expired</h3>
                <p>
                  The hold duration ended without verified payment. Your reserved items were automatically
                  released back to inventory for other counter patrons.
                </p>
                <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={onClose}>
                  Browse Fresh Inventory
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* STATE 5: NEEDS REVIEW                                        */}
          {/* ──────────────────────────────────────────────────────────── */}
          {status === 'needs_review' && (
            <div className="status-banner banner-warning">
              <div className="banner-icon">⚠️</div>
              <div className="banner-text">
                <h3>Payment Flagged for Attendant Review</h3>
                <p>
                  Reason: <strong>{reviewReason || 'Manual audit required'}</strong>.
                  {refundFlag && ' (A refund has been flagged for automated disbursement).'}
                </p>
                <p className="sub-warning">
                  Please show your order reference <strong>#{shortId}</strong> to the counter staff. Do not pay again.
                </p>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* COLLAPSIBLE REVIEWER / DEV CONSOLE                           */}
          {/* ──────────────────────────────────────────────────────────── */}
          <div className="dev-console-drawer">
            <button
              className="dev-console-toggle"
              onClick={() => setShowDevTools(!showDevTools)}
              aria-expanded={showDevTools}
            >
              <span>🛠️ Reviewer Test Console & Simulation Flags</span>
              <span>{showDevTools ? '▲ Hide' : '▼ Expand'}</span>
            </button>

            {showDevTools && (
              <div className="dev-console-content">
                <p className="dev-console-desc">
                  Simulate external payment gateway edge cases in real-time (HMAC-SHA256 authenticated):
                </p>
                <div className="dev-button-grid">
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={status !== 'pending'}
                    onClick={() => handleDevWebhook('mismatch')}
                  >
                    ⚠️ Send Wrong Amount (₹10.00 Mismatch)
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={status !== 'pending'}
                    onClick={() => handleDevWebhook('badsig')}
                  >
                    ⛔ Tamper HMAC Signature (401 Rejection)
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => handleDevWebhook('duplicate')}
                  >
                    🔁 Send Duplicate Webhook Event
                  </button>
                </div>

                {devResult && (
                  <div className="dev-result-box">
                    <code>{devResult}</code>
                  </div>
                )}

                <div className="cli-terminal-helper">
                  <div className="cli-header">
                    <span>Terminal cURL / CLI Command:</span>
                    <button className="btn-copy" onClick={copyToClipboard}>
                      {copiedCli ? 'Copied! ✓' : 'Copy'}
                    </button>
                  </div>
                  <pre className="cli-code">{cliCommand}</pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {isTerminal ? 'Done' : 'Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
};
