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
  paid: 'Paid · Ready for pickup',
  expired: 'Hold expired',
  needs_review: 'Needs review',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
};

const reviewReasonLabels: Record<string, string> = {
  amount_mismatch: 'Payment amount did not match the server order total.',
  late_payment_stock_gone: 'Payment arrived after the hold expired and stock was already claimed.',
  payment_after_cancel: 'Payment arrived after the reservation was cancelled.',
};

const formatOrderDate = (value?: string | null) => {
  if (!value) return 'N/A';
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
          setLoadError('Order not found.');
        } else if (!silent) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load order.');
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
        setPaymentError('Payment flagged for counter review.');
      } else if (result.outcome === 'ignored' || result.duplicate) {
        setPaymentError('Payment event already processed.');
      }
    } catch (error) {
      setPaymentError(
        error instanceof ApiError ? error.message : 'Payment failed. Please try again.',
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
      showToast('Reservation cancelled. Stock returned to catalog.', 'info');
    } catch (error) {
      if (error instanceof ApiError) {
        setCancelError(error.message);
      } else {
        setCancelError('Unable to cancel reservation.');
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
        error instanceof ApiError ? error.message : 'Unable to claim locker pickup.',
      );
      await loadOrder(true).catch(() => undefined);
    } finally {
      setIsClaiming(false);
    }
  };

  if (!orderId || loadError) {
    return (
      <div className="empty-catalog-state page-empty-state">
        <h2>{loadError || 'Order not found'}</h2>
        <p>Check your saved orders or start a new reservation from the catalog.</p>
        <div className="empty-state-actions">
          <Link to="/orders" className="btn btn-secondary btn-sm">
            My Orders
          </Link>
          <Link to="/" className="btn btn-primary btn-sm">
            Back to Catalog
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading && !order) {
    return <div className="page-loading-shell">Loading order...</div>;
  }

  if (!order) {
    return (
      <div className="empty-catalog-state page-empty-state">
        <h2>Order unavailable</h2>
        <p>Could not load order details. Please check your connection.</p>
        <button className="btn btn-primary btn-sm" onClick={() => loadOrder()}>
          Retry
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
  const totalLabel = isCollected ? 'Total Paid' : 'Order Total';
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
          ← Back to Catalog
        </Link>
        <span className="order-ref">ID: {order.id}</span>
      </div>

      <header className="order-page-header">
        <div>
          <span className="section-eyebrow">Order #{shortId}</span>
          <h1>
            {order.status === 'pending' && 'Complete Payment'}
            {order.status === 'paid' && 'Ready for Locker Pickup'}
            {order.status === 'picked_up' && 'Order Picked Up'}
            {order.status === 'expired' && 'Reservation Expired'}
            {order.status === 'cancelled' && 'Reservation Cancelled'}
            {order.status === 'needs_review' && 'Payment Under Review'}
          </h1>
          <p className="order-header-copy">
            Created {formatOrderDate(order.createdAt)} · {formatRupees(order.totalPaise)}
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
            <small>Stock held</small>
          </div>
        </div>
        <div className={`timeline-step ${order.status !== 'pending' ? 'is-done' : ''}`}>
          <span>2</span>
          <div>
            <strong>Paid</strong>
            <small>{order.paidAt ? formatOrderDate(order.paidAt) : 'Pending'}</small>
          </div>
        </div>
        <div className={`timeline-step ${isPaid || order.status === 'picked_up' ? 'is-done' : ''}`}>
          <span>3</span>
          <div>
            <strong>Locker Ready</strong>
            <small>{lockerLabel ? lockerLabel : 'Assigned on payment'}</small>
          </div>
        </div>
        <div className={`timeline-step ${order.status === 'picked_up' ? 'is-done' : ''}`}>
          <span>4</span>
          <div>
            <strong>Picked Up</strong>
            <small>{order.pickedUpAt ? formatOrderDate(order.pickedUpAt) : 'Pending pickup'}</small>
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
                      {isZero ? 'Hold window ended' : `Active ${holdLabel} hold`}
                    </span>
                    <strong className="hold-time">{formatted}</strong>
                    <p>
                      {isZero
                        ? 'Syncing status with the server. Do not initiate a duplicate payment.'
                        : 'Stock is reserved for this order until the timer reaches 00:00.'}
                    </p>
                  </div>
                  <div className="hold-meta-side">
                    <span>Expires {formatOrderDate(order.expiresAt)}</span>
                  </div>
                </div>
                <div className="progress-bar-track hold-progress">
                  <div
                    className={`progress-bar-fill ${remaining < 25 ? 'fill-urgent' : ''}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="payment-panel">
                <div className="panel-heading payment-panel-heading">
                  <div>
                    <h2>Payment Method</h2>
                    <p>Select a payment option to complete your order.</p>
                  </div>
                  <span className="sandbox-chip">Sandbox Mode</span>
                </div>

                <div className="payment-method-tabs" role="tablist" aria-label="Payment method">
                  <button
                    role="tab"
                    aria-selected={paymentMethod === 'upi'}
                    className={`method-tab ${paymentMethod === 'upi' ? 'is-active' : ''}`}
                    onClick={() => setPaymentMethod('upi')}
                  >
                    UPI
                  </button>
                  <button
                    role="tab"
                    aria-selected={paymentMethod === 'card'}
                    className={`method-tab ${paymentMethod === 'card' ? 'is-active' : ''}`}
                    onClick={() => setPaymentMethod('card')}
                  >
                    Card
                  </button>
                  <button
                    role="tab"
                    aria-selected={paymentMethod === 'counter'}
                    className={`method-tab ${paymentMethod === 'counter' ? 'is-active' : ''}`}
                    onClick={() => setPaymentMethod('counter')}
                  >
                    Counter Cash
                  </button>
                </div>

                {paymentMethod === 'upi' && (
                  <div className="payment-body upi-body">
                    <div className="upi-qr-card">
                      <QRCodeSVG
                        value={upiLink}
                        size={132}
                        level="M"
                        bgColor="#FFFFFF"
                        fgColor="#24211D"
                      />
                      <span>UPI QR</span>
                    </div>
                    <div className="payment-copy">
                      <h3>Pay {formatRupees(order.totalPaise)} via UPI</h3>
                      <p>
                        Use the button below to trigger a sandbox UPI payment callback for this order.
                      </p>
                      <div className="upi-id-pill">
                        <code>metrosober.counter@demo</code>
                      </div>
                      {health?.demoMode === false ? (
                        <p className="payment-disabled-note">
                          Demo checkout is disabled. Send a signed webhook using the CLI command below.
                        </p>
                      ) : (
                        <button
                          className="btn btn-primary btn-customer-action"
                          onClick={handleDemoPayment}
                          disabled={isPaying || isZero}
                        >
                          {isPaying ? (
                            <>
                              <span className="spinner"></span> Processing payment...
                            </>
                          ) : isZero ? (
                            'Hold expired (syncing status)'
                          ) : (
                            `Simulate UPI Payment (${formatRupees(order.totalPaise)})`
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === 'card' && (
                  <div className="payment-body payment-message-body">
                    <h3>Sandbox Card Payment</h3>
                    <p>
                      Card inputs are omitted in sandbox mode. Trigger a simulated card capture below.
                    </p>
                    {health?.demoMode !== false && (
                      <button
                        className="btn btn-primary"
                        onClick={handleDemoPayment}
                        disabled={isPaying || isZero}
                      >
                        Simulate Card Payment ({formatRupees(order.totalPaise)})
                      </button>
                    )}
                  </div>
                )}

                {paymentMethod === 'counter' && (
                  <div className="payment-body payment-message-body">
                    <h3>Pay at the Counter</h3>
                    <p>
                      Provide order reference <strong>#{shortId}</strong> to staff at the counter.
                    </p>
                    {health?.demoMode !== false && (
                      <button
                        className="btn btn-primary"
                        onClick={handleDemoPayment}
                        disabled={isPaying || isZero}
                      >
                        {isPaying ? 'Confirming...' : 'Confirm Counter Payment (Demo)'}
                      </button>
                    )}
                  </div>
                )}

                {paymentError && <div className="alert alert-error">{paymentError}</div>}

                <div className="webhook-helper">
                  <strong>CLI Signed Webhook Command:</strong>
                  <code>{webhookCommand}</code>
                </div>
              </div>

              <div className="cancel-zone">
                {!showCancelConfirm ? (
                  <button className="btn-text-danger" onClick={() => setShowCancelConfirm(true)}>
                    Cancel Reservation & Release Stock
                  </button>
                ) : (
                  <div className="cancel-confirm">
                    <div>
                      <strong>Cancel this reservation?</strong>
                      <p>Held units will return to available stock immediately.</p>
                      {cancelError && <p className="form-error">{cancelError}</p>}
                    </div>
                    <div className="cancel-confirm-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={isCancelling}
                      >
                        Keep Hold
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={handleCancel}
                        disabled={isCancelling}
                      >
                        {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
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
                  <span className="success-kicker">Payment Confirmed</span>
                  <h2>Locker Ready for Collection</h2>
                  <p>
                    {formatRupees(order.totalPaise)} received. Open your assigned locker bay below to collect your items.
                  </p>
                </div>
              </div>

              <div className="locker-card">
                <div className="locker-display">
                  <div className="locker-screen">
                    <span className="locker-screen-label">ASSIGNED LOCKER</span>
                    <strong>{lockerLabel ?? 'Bay 01'}</strong>
                    <span className="locker-ready-pill">READY FOR PICKUP</span>
                  </div>
                  <div className="locker-door-handle"></div>
                </div>
                <div className="pickup-code-panel">
                  <span>Pickup Code</span>
                  <strong>{pickupCode}</strong>
                  <p>Use this 4-digit code at the counter terminal.</p>
                </div>
              </div>

              {claimError && <div className="alert alert-error">{claimError}</div>}

              <button
                className="btn btn-success btn-large-claim"
                onClick={handleClaim}
                disabled={isClaiming}
              >
                {isClaiming ? 'Unlocking...' : `Open ${lockerLabel ?? 'Locker'} & Claim Order`}
              </button>
            </>
          )}

          {order.status === 'picked_up' && (
            <>
              <div className="collected-banner">
                <span className="collected-trophy">✓</span>
                <div>
                  <span className="success-kicker">Completed</span>
                  <h2>Order Collected</h2>
                  <p>
                    Collected from {lockerLabel ?? 'the locker'}. Physical stock has been permanently decremented.
                  </p>
                </div>
              </div>

              <div className="digital-receipt-card">
                <div className="receipt-top-bar">
                  <span>RECEIPT</span>
                  <span>{formatOrderDate(order.pickedUpAt)}</span>
                </div>
                <div className="receipt-meta-grid">
                  <div>
                    <span className="meta-k">Order ID:</span>
                    <span className="meta-v">{order.id}</span>
                  </div>
                  <div>
                    <span className="meta-k">Locker:</span>
                    <span className="meta-v">{lockerLabel ?? 'N/A'}</span>
                  </div>
                  <div>
                    <span className="meta-k">Pickup Code:</span>
                    <span className="meta-v">{pickupCode}</span>
                  </div>
                </div>
                <div className="receipt-divider"></div>
                <div className="receipt-lines">
                  {items.map((item) => (
                    <div key={item.productId} className="receipt-line">
                      <span>
                        {item.name} x {item.quantity}
                      </span>
                      <span>{formatRupees(item.unitPricePaise * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="receipt-divider"></div>
                <div className="receipt-total-line">
                  <span>Total Paid</span>
                  <span className="receipt-total-val">{formatRupees(order.totalPaise)}</span>
                </div>
              </div>

              <div className="collected-actions">
                <Link to="/" className="btn btn-primary btn-sm">
                  Back to Catalog
                </Link>
                <Link to="/orders" className="btn btn-secondary btn-sm">
                  View All Orders
                </Link>
              </div>
            </>
          )}

          {order.status === 'expired' && (
            <div className="terminal-state-card state-expired">
              <h2>Hold Window Expired</h2>
              <p>
                The {holdLabel} hold expired before payment was confirmed, and reserved units were returned to available stock.
              </p>
              <div className="terminal-state-actions">
                <Link to="/" className="btn btn-primary btn-sm">
                  Browse Catalog
                </Link>
                <Link to="/orders" className="btn btn-secondary btn-sm">
                  My Orders
                </Link>
              </div>
            </div>
          )}

          {order.status === 'needs_review' && (
            <div className="terminal-state-card state-review">
              <h2>Payment Flagged for Review</h2>
              <p>
                {reviewReasonLabels[order.reviewReason ?? ''] ??
                  'This payment requires manual review by counter staff.'}
              </p>
              <div className="review-reference">
                <span>Order Ref:</span>
                <strong>#{shortId}</strong>
              </div>
              {order.refundFlag && (
                <div>
                  <span className="refund-flag">Refund Flagged</span>
                </div>
              )}
            </div>
          )}

          {order.status === 'cancelled' && (
            <div className="terminal-state-card state-cancelled">
              <h2>Reservation Cancelled</h2>
              <p>This hold was cancelled and all reserved units were returned to the catalog.</p>
              <div className="terminal-state-actions">
                <Link to="/" className="btn btn-primary btn-sm">
                  Browse Catalog
                </Link>
                <Link to="/orders" className="btn btn-secondary btn-sm">
                  My Orders
                </Link>
              </div>
            </div>
          )}
        </section>

        <aside className="order-summary-side">
          <div className="order-summary-card">
            <div className="panel-heading">
              <h2>Order Summary</h2>
              <span className="summary-status">{statusLabels[order.status]}</span>
            </div>

            <ul className="order-side-items">
              {items.map((item) => (
                <li key={item.productId}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.quantity} x {formatRupees(item.unitPricePaise)}
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
                <span>Reference</span>
                <strong>#{shortId}</strong>
              </div>
              <div>
                <span>Locker</span>
                <strong>{isCollected ? lockerLabel ?? 'N/A' : 'After payment'}</strong>
              </div>
              <div>
                <span>Pickup Code</span>
                <strong>{isCollected ? pickupCode : 'After payment'}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{formatOrderDate(order.createdAt)}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
