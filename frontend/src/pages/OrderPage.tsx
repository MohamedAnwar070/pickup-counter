import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  formatRupees,
  GetOrderResponse,
  OrderStatus,
  sound,
  formatHoldDuration,
} from '../common';
import {
  ApiError,
  cancelOrder,
  claimPickup,
  fetchOrder,
  payDemo,
} from '../api/client';
import { useCountdown } from '../hooks/useCountdown';
import { useOrders } from '../state/OrdersContext';
import { useShop } from '../state/ShopContext';

type PaymentMethod = 'upi' | 'card' | 'counter';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid · ready for pickup',
  expired: 'Hold expired',
  needs_review: 'Needs counter review',
  picked_up: 'Collected',
  cancelled: 'Reservation cancelled',
};

const reviewReasonLabels: Record<string, string> = {
  amount_mismatch: 'The amount received did not match this order.',
  late_payment_stock_gone: 'Payment arrived after the hold, and stock was no longer available.',
  payment_after_cancel: 'Payment arrived after the reservation was cancelled.',
};

const formatOrderDate = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const OrderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? '';
  const { holdSeconds, health, showToast } = useShop();
  const { updateOrderStatus, forgetOrder } = useOrders();

  const [order, setOrder] = useState<GetOrderResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const previousStatus = useRef<OrderStatus | null>(null);

  const { remaining, formatted, isZero, percentage } = useCountdown(
    order?.expiresInSeconds,
    order?.holdSeconds ?? holdSeconds,
  );

  const loadOrder = useCallback(
    async (silent = false) => {
      if (!orderId) return;
      if (!silent) setIsLoading(true);
      try {
        const latest = await fetchOrder(orderId);
        if (previousStatus.current === 'pending' && latest.status === 'paid') {
          sound.playPaymentSuccess();
        }
        previousStatus.current = latest.status;
        setOrder(latest);
        setLoadError(null);
        updateOrderStatus(latest.id, latest.status, latest.lockerNumber);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          forgetOrder(orderId);
          setLoadError('That reservation could not be found.');
        } else if (!silent) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not load this reservation.',
          );
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [forgetOrder, orderId, updateOrderStatus],
  );

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!order || order.status !== 'pending') return;
    const interval = window.setInterval(() => {
      loadOrder(true).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [order?.status, loadOrder]);

  const handleDemoPayment = async () => {
    if (isPaying || isZero || !order) return;
    setIsPaying(true);
    setPaymentError(null);
    try {
      const result = await payDemo(order.id);
      await loadOrder(true);
      if (result.outcome === 'needs_review') {
        setPaymentError('The payment was received but needs a counter review.');
      } else if (result.outcome === 'ignored' || result.duplicate) {
        setPaymentError('That payment event was already processed. Checking the order…');
      }
    } catch (error) {
      setPaymentError(
        error instanceof ApiError
          ? error.message
          : 'The sandbox payment could not be completed. Please try again.',
      );
      await loadOrder(true).catch(() => undefined);
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancel = async () => {
    if (!order || isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelOrder(order.id);
      setOrder((current) =>
        current
          ? { ...current, status: 'cancelled', cancelledAt: new Date().toISOString() }
          : current,
      );
      updateOrderStatus(order.id, 'cancelled');
      previousStatus.current = 'cancelled';
      setShowCancelConfirm(false);
      showToast('Reservation cancelled. The stock is back on the counter.', 'info');
    } catch (error) {
      if (error instanceof ApiError) {
        setCancelError(error.message);
      } else {
        setCancelError('Could not cancel this reservation. Please try again.');
      }
      await loadOrder(true).catch(() => undefined);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleClaim = async () => {
    if (!order || isClaiming) return;
    setIsClaiming(true);
    setClaimError(null);
    try {
      await claimPickup(order.id);
      sound.playLockerUnlock();
      setOrder((current) => (current ? { ...current, status: 'picked_up' } : current));
      updateOrderStatus(order.id, 'picked_up');
      previousStatus.current = 'picked_up';
    } catch (error) {
      setClaimError(
        error instanceof ApiError
          ? error.message
          : 'The locker could not be opened. Please ask a counter attendant.',
      );
      await loadOrder(true).catch(() => undefined);
    } finally {
      setIsClaiming(false);
    }
  };

  if (!orderId || loadError) {
    return (
      <div className="empty-catalog-state page-empty-state">
        <div className="empty-icon">🔎</div>
        <h2>{loadError || 'Reservation not found'}</h2>
        <p>Check your reservations or start a fresh order from the counter.</p>
        <div className="empty-state-actions">
          <Link to="/orders" className="btn btn-secondary">
            My reservations
          </Link>
          <Link to="/" className="btn btn-primary">
            Back to shop
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading && !order) {
    return <div className="page-loading-shell">Loading your reservation…</div>;
  }

  if (!order) {
    return (
      <div className="empty-catalog-state page-empty-state">
        <div className="empty-icon">🔎</div>
        <h2>Reservation unavailable</h2>
        <p>We could not load this order. Check your connection and try again.</p>
        <button className="btn btn-primary" onClick={() => loadOrder()}>
          Try again
        </button>
      </div>
    );
  }

  const items = order.items ?? [];
  const shortId = order.id.slice(0, 8).toUpperCase();
  const isPending = order.status === 'pending';
  const isPaid = order.status === 'paid';
  const isPickedUp = order.status === 'picked_up';
  const isCollected = isPaid || isPickedUp;
  const holdLabel = formatHoldDuration(order.holdSeconds ?? holdSeconds);
  const lockerLabel = order.lockerNumber ? `Bay ${String(order.lockerNumber).padStart(2, '0')}` : null;
  const pickupCode = order.pickupCode ?? '----';
  const totalLabel = isCollected ? 'Total paid' : 'Order total';
  const upiParams = new URLSearchParams({
    pa: 'metrosober.counter@demo',
    pn: 'MetroSober Counter',
    am: (order.totalPaise / 100).toFixed(2),
    cu: 'INR',
    tn: `Order ${shortId}`,
  });
  const upiLink = `upi://pay?${upiParams.toString()}`;
  const webhookCommand = `npm run send-webhook -- --orderId ${order.id} --amount ${order.totalPaise}`;

  return (
    <div className="order-page">
      <div className="order-page-topbar">
        <Link to="/" className="back-link">
          ← Back to shop
        </Link>
        <span className="order-ref">Order #{shortId}</span>
      </div>

      <header className="order-page-header">
        <div>
          <span className="section-eyebrow">MetroSober counter pickup</span>
          <h1>
            {order.status === 'pending' && 'Your stock is reserved.'}
            {order.status === 'paid' && 'Payment received. Your locker is ready.'}
            {order.status === 'picked_up' && 'Collected. Enjoy your goods.'}
            {order.status === 'expired' && 'The hold has ended.'}
            {order.status === 'cancelled' && 'Reservation cancelled.'}
            {order.status === 'needs_review' && 'Payment needs a counter check.'}
          </h1>
          <p className="order-header-copy">
            Placed {formatOrderDate(order.createdAt)} · {formatRupees(order.totalPaise)}
          </p>
        </div>
        <span className={`order-status-badge status-${order.status}`}>
          <span className="status-badge-dot"></span>
          {statusLabels[order.status]}
        </span>
      </header>

      <div className="order-timeline" aria-label="Order progress">
        <div className="timeline-step is-done">
          <span>1</span>
          <div>
            <strong>Reserved</strong>
            <small>Stock held for you</small>
          </div>
        </div>
        <div className={`timeline-step ${order.status !== 'pending' ? 'is-done' : ''}`}>
          <span>2</span>
          <div>
            <strong>Paid</strong>
            <small>{order.paidAt ? formatOrderDate(order.paidAt) : 'Awaiting payment'}</small>
          </div>
        </div>
        <div className={`timeline-step ${isPaid || order.status === 'picked_up' ? 'is-done' : ''}`}>
          <span>3</span>
          <div>
            <strong>Ready</strong>
            <small>{lockerLabel ? `${lockerLabel} locker` : 'After payment'}</small>
          </div>
        </div>
        <div className={`timeline-step ${order.status === 'picked_up' ? 'is-done' : ''}`}>
          <span>4</span>
          <div>
            <strong>Collected</strong>
            <small>{order.pickedUpAt ? formatOrderDate(order.pickedUpAt) : 'Open your locker'}</small>
          </div>
        </div>
      </div>

      <div className="order-layout">
        <section className="order-main-panel">
          {isPending && (
            <>
              <div className={`hold-timer-card ${isZero ? 'is-zero' : ''}`}>
                <div className="hold-timer-top">
                  <div>
                    <span className="hold-kicker">
                      <span className="hold-live-dot"></span>
                      {isZero ? 'Hold window ended' : 'Your exclusive hold'}
                    </span>
                    <strong className="hold-time">{formatted}</strong>
                    <p>
                      {isZero
                        ? 'We’re checking the final status with the counter. Please don’t make a new payment.'
                        : `These units are held for you. Complete payment before the timer reaches zero.`}
                    </p>
                  </div>
                  <div className="hold-timer-icon">⏱</div>
                </div>
                <div className="progress-bar-track hold-progress">
                  <div
                    className={`progress-bar-fill ${remaining < 25 ? 'fill-urgent' : ''}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <div className="hold-meta-row">
                  <span>Expires {formatOrderDate(order.expiresAt)}</span>
                  <span>Stock is not charged until payment</span>
                </div>
              </div>

              <div className="payment-panel">
                <div className="panel-heading payment-panel-heading">
                  <div>
                    <h2>Choose how to pay</h2>
                    <p>Complete your payment inside the hold window.</p>
                  </div>
                  <span className="sandbox-chip">Demo gateway</span>
                </div>

                <div className="payment-method-tabs" role="tablist" aria-label="Payment method">
                  <button
                    role="tab"
                    aria-selected={paymentMethod === 'upi'}
                    className={`method-tab ${paymentMethod === 'upi' ? 'is-active' : ''}`}
                    onClick={() => setPaymentMethod('upi')}
                  >
                    <span className="tab-icon">⚡</span>
                    <span className="tab-text">UPI</span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={paymentMethod === 'card'}
                    className={`method-tab ${paymentMethod === 'card' ? 'is-active' : ''}`}
                    onClick={() => setPaymentMethod('card')}
                  >
                    <span className="tab-icon">▣</span>
                    <span className="tab-text">Card</span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={paymentMethod === 'counter'}
                    className={`method-tab ${paymentMethod === 'counter' ? 'is-active' : ''}`}
                    onClick={() => setPaymentMethod('counter')}
                  >
                    <span className="tab-icon">⌂</span>
                    <span className="tab-text">At counter</span>
                  </button>
                </div>

                {paymentMethod === 'upi' && (
                  <div className="payment-body upi-body">
                    <div className="upi-qr-card">
                      <QRCodeSVG
                        value={upiLink}
                        size={156}
                        level="M"
                        bgColor="#FFFFFF"
                        fgColor="#24211D"
                      />
                      <span>Sandbox UPI QR</span>
                    </div>
                    <div className="payment-copy">
                      <h3>Pay {formatRupees(order.totalPaise)} by UPI</h3>
                      <p>
                        This QR is a working demo UPI intent, not a live payment request.
                        Use the button below to simulate a successful provider callback.
                      </p>
                      <div className="upi-id-pill">
                        <code>metrosober.counter@demo</code>
                      </div>
                      {health?.demoMode === false ? (
                        <p className="payment-disabled-note">
                          Demo checkout is disabled. Ask the counter to send a signed webhook.
                        </p>
                      ) : (
                        <button
                          className="btn btn-primary btn-customer-action"
                          onClick={handleDemoPayment}
                          disabled={isPaying || isZero}
                        >
                          {isPaying ? (
                            <>
                              <span className="spinner"></span> Confirming payment…
                            </>
                          ) : isZero ? (
                            'Hold ended — confirming status'
                          ) : (
                            <>Complete sandbox UPI payment · {formatRupees(order.totalPaise)}</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === 'card' && (
                  <div className="payment-body payment-message-body">
                    <div className="payment-message-icon">▣</div>
                    <h3>Card gateway is not connected</h3>
                    <p>
                      This build intentionally does not collect card details. In production,
                      this step would hand off to an authorised payment provider.
                    </p>
                    {health?.demoMode !== false && (
                      <button
                        className="btn btn-secondary"
                        onClick={handleDemoPayment}
                        disabled={isPaying || isZero}
                      >
                        Simulate a successful card payment
                      </button>
                    )}
                  </div>
                )}

                {paymentMethod === 'counter' && (
                  <div className="payment-body payment-message-body">
                    <div className="payment-message-icon">⌂</div>
                    <h3>Pay an attendant at the counter</h3>
                    <p>
                      Show order <strong>#{shortId}</strong> to the counter team. In this
                      demo, the attendant can confirm the cash payment below.
                    </p>
                    {health?.demoMode !== false && (
                      <button
                        className="btn btn-primary"
                        onClick={handleDemoPayment}
                        disabled={isPaying || isZero}
                      >
                        {isPaying ? 'Staff confirming…' : 'Staff: confirm cash received (demo)'}
                      </button>
                    )}
                  </div>
                )}

                {paymentError && <div className="alert alert-error">{paymentError}</div>}

                <div className="webhook-helper">
                  <strong>Reviewer payment command</strong>
                  <span>Run from the repo root to send a correctly signed webhook:</span>
                  <code>{webhookCommand}</code>
                </div>

                <div className="payment-footer-note">
                  <span>🔒</span>
                  <span>
                    The server calculates the total and verifies every payment outcome. The
                    browser never receives the webhook secret.
                  </span>
                </div>
              </div>

              <div className="cancel-zone">
                {!showCancelConfirm ? (
                  <button className="btn-text-danger" onClick={() => setShowCancelConfirm(true)}>
                    Cancel this reservation
                  </button>
                ) : (
                  <div className="cancel-confirm">
                    <div>
                      <strong>Release your hold?</strong>
                      <p>
                        The items go back to the counter immediately and cannot be reserved
                        again at this price unless they are still available.
                      </p>
                      {cancelError && <p className="form-error">{cancelError}</p>}
                    </div>
                    <div className="cancel-confirm-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={isCancelling}
                      >
                        Keep reservation
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={handleCancel}
                        disabled={isCancelling}
                      >
                        {isCancelling ? 'Cancelling…' : 'Cancel hold'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {isPaid && (
            <>
              <div className="order-success-hero">
                <div className="success-badge-pulse">✓</div>
                <div>
                  <span className="success-kicker">Payment verified</span>
                  <h2>Your locker is ready</h2>
                  <p>
                    {formatRupees(order.totalPaise)} paid. Head to the MetroSober counter,
                    open your locker, and take your goods.
                  </p>
                </div>
              </div>

              <div className="locker-card">
                <div className="locker-display">
                  <div className="locker-screen">
                    <span className="locker-screen-label">METROSOBER LOCKER</span>
                    <strong>{lockerLabel ?? 'Bay assigned'}</strong>
                    <span className="locker-ready-pill">READY FOR COLLECTION</span>
                  </div>
                  <div className="locker-door-handle"></div>
                </div>
                <div className="pickup-code-panel">
                  <span>Your pickup code</span>
                  <strong>{pickupCode}</strong>
                  <p>Show this code at the counter if an attendant is present.</p>
                </div>
              </div>

              <div className="pickup-instructions">
                <div>
                  <span className="instruction-number">1</span>
                  <p>
                    <strong>Go to the counter</strong>
                    <span>Look for locker {lockerLabel ?? 'bay'} in the collection wall.</span>
                  </p>
                </div>
                <div>
                  <span className="instruction-number">2</span>
                  <p>
                    <strong>Open your locker</strong>
                    <span>Use the button below to trigger the demo locker release.</span>
                  </p>
                </div>
                <div>
                  <span className="instruction-number">3</span>
                  <p>
                    <strong>Take your goods</strong>
                    <span>Collection is single-use and stock is decremented once.</span>
                  </p>
                </div>
              </div>

              {claimError && <div className="alert alert-error">{claimError}</div>}

              <button
                className="btn btn-success btn-large-claim"
                onClick={handleClaim}
                disabled={isClaiming}
              >
                {isClaiming
                  ? 'Opening locker…'
                  : `Open ${lockerLabel ?? 'locker'} & collect goods`}
              </button>
              <p className="locker-single-use">
                Locker opening is idempotent and single-use. If it jams, ask the counter team.
              </p>

              <Link to="/" className="text-link centered-link">
                Keep browsing while you collect
              </Link>
            </>
          )}

          {order.status === 'picked_up' && (
            <>
              <div className="collected-banner">
                <span className="collected-trophy">✓</span>
                <div>
                  <span className="success-kicker">Collection complete</span>
                  <h2>Thanks for stopping by.</h2>
                  <p>
                    Your order was released from {lockerLabel ?? 'the locker'} and the counter
                    stock was updated exactly once.
                  </p>
                </div>
              </div>

              <div className="digital-receipt-card">
                <div className="receipt-top-bar">
                  <span>METROSOBER COUNTER · DIGITAL RECEIPT</span>
                  <span>{formatOrderDate(order.pickedUpAt)}</span>
                </div>
                <div className="receipt-meta-grid">
                  <div>
                    <span className="meta-k">Order</span>
                    <span className="meta-v">#{order.id}</span>
                  </div>
                  <div>
                    <span className="meta-k">Locker</span>
                    <span className="meta-v">{lockerLabel ?? '—'}</span>
                  </div>
                  <div>
                    <span className="meta-k">Pickup code</span>
                    <span className="meta-v">{pickupCode}</span>
                  </div>
                </div>
                <div className="receipt-divider"></div>
                <div className="receipt-lines">
                  {items.map((item) => (
                    <div key={item.productId} className="receipt-line">
                      <span>
                        {item.name} × {item.quantity}
                      </span>
                      <span>{formatRupees(item.unitPricePaise * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="receipt-divider"></div>
                <div className="receipt-total-line">
                  <span>Paid</span>
                  <span className="receipt-total-val">{formatRupees(order.totalPaise)}</span>
                </div>
              </div>

              <div className="collected-actions">
                <Link to="/" className="btn btn-primary">
                  Back to the counter
                </Link>
                <Link to="/orders" className="btn btn-secondary">
                  View all reservations
                </Link>
              </div>
            </>
          )}

          {order.status === 'expired' && (
            <div className="terminal-state-card state-expired">
              <div className="terminal-state-icon">⏱</div>
              <h2>Your {holdLabel} hold ended</h2>
              <p>
                The timer ran out before payment was confirmed, so the units went back to
                the counter. Nothing was charged for this reservation.
              </p>
              <div className="terminal-state-actions">
                <Link to="/" className="btn btn-primary">
                  Shop the counter again
                </Link>
                <Link to="/orders" className="btn btn-secondary">
                  My reservations
                </Link>
              </div>
              <p className="terminal-hint">
                If you paid just before the timer ended, wait a moment — a late payment can
                still be accepted if stock is available.
              </p>
            </div>
          )}

          {order.status === 'needs_review' && (
            <div className="terminal-state-card state-review">
              <div className="terminal-state-icon">!</div>
              <h2>We’re checking your payment</h2>
              <p>
                {reviewReasonLabels[order.reviewReason ?? ''] ??
                  'The counter team needs to review this payment.'}
              </p>
              <div className="review-reference">
                <span>Reference</span>
                <strong>#{shortId}</strong>
              </div>
              <p className="terminal-hint">
                Do not pay again. Please show this reference to a counter attendant. The team
                will resolve the order or process a refund.
              </p>
              {order.refundFlag && (
                <span className="refund-flag">Refund flag raised on this order</span>
              )}
            </div>
          )}

          {order.status === 'cancelled' && (
            <div className="terminal-state-card state-cancelled">
              <div className="terminal-state-icon">✕</div>
              <h2>No stock is being held</h2>
              <p>
                You cancelled this reservation. The goods were returned to the counter
                immediately and no payment was taken.
              </p>
              <div className="terminal-state-actions">
                <Link to="/" className="btn btn-primary">
                  Start again
                </Link>
                <Link to="/orders" className="btn btn-secondary">
                  My reservations
                </Link>
              </div>
            </div>
          )}
        </section>

        <aside className="order-summary-side">
          <div className="order-summary-card">
            <div className="panel-heading">
              <h2>Order details</h2>
              <span className="summary-status">{statusLabels[order.status]}</span>
            </div>

            <ul className="order-side-items">
              {items.map((item) => (
                <li key={item.productId}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.quantity} × {formatRupees(item.unitPricePaise)}
                    </span>
                  </div>
                  <span>{formatRupees(item.unitPricePaise * item.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="summary-divider"></div>
            <div className="summary-total-row">
              <span>{totalLabel}</span>
              <strong>{formatRupees(order.totalPaise)}</strong>
            </div>
            <p className="summary-paise-note">{order.totalPaise} paise</p>

            <div className="order-facts">
              <div>
                <span>Order</span>
                <strong>#{shortId}</strong>
              </div>
              <div>
                <span>Locker</span>
                <strong>{isCollected ? lockerLabel ?? '—' : 'Assigned after payment'}</strong>
              </div>
              <div>
                <span>Pickup code</span>
                <strong>
                  {isCollected ? pickupCode : isPending ? 'After payment' : '—'}
                </strong>
              </div>
              <div>
                <span>Placed</span>
                <strong>{formatOrderDate(order.createdAt)}</strong>
              </div>
            </div>
          </div>

          <div className="order-help-card">
            <span className="order-help-icon">☏</span>
            <div>
              <strong>Need a hand?</strong>
              <p>
                Show order #{shortId} to the MetroSober counter team. Keep this page or find
                it later in My reservations.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
