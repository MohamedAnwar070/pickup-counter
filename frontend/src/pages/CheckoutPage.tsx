import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatRupees, StockShortage } from '@pickup-counter/shared';
import { ApiError, createOrder } from '../api/client';
import { useOrders } from '../state/OrdersContext';
import { useShop } from '../state/ShopContext';
import { ProductImage } from '../components/ProductImage';
import { formatHoldDuration } from '../utils/hold';

export const CheckoutPage: React.FC = () => {
  const {
    cart,
    cartCount,
    cartTotalPaise,
    setQuantity,
    removeFromCart,
    clearCart,
    refreshProducts,
    reconcileCart,
    holdSeconds,
    showToast,
  } = useShop();
  const { rememberOrder, activeOrder } = useOrders();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [shortages, setShortages] = useState<StockShortage[]>([]);

  const holdLabel = formatHoldDuration(holdSeconds);

  const activeElsewhere =
    activeOrder && activeOrder.id && activeOrder.status === 'pending' ? activeOrder : null;

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);
    setShortages([]);

    try {
      const response = await createOrder(
        cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      );

      rememberOrder(response);
      clearCart();
      showToast('Stock reserved. Complete payment within the hold window.');
      navigate(`/order/${response.orderId}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_STOCK') {
        const affected = error.details?.shortages ?? [];
        setShortages(affected);
        setErrorCode(error.code);
        setErrorMessage(error.message);
        reconcileCart(affected);
        await refreshProducts(true).catch(() => undefined);
        showToast('Some items changed while you were checking out. Your basket was updated.', 'error');
      } else if (error instanceof ApiError) {
        setErrorCode(error.code);
        setErrorMessage(error.message);
        if (error.code === 'PRODUCT_NOT_FOUND') {
          await refreshProducts(true).catch(() => undefined);
        }
      } else {
        setErrorMessage('The counter could not be reached. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <div className="checkout-progress" aria-label="Checkout progress">
          <span className="is-complete">Basket</span>
          <span className="is-active">Reserve</span>
          <span>Pay</span>
          <span>Collect</span>
        </div>
        <div className="empty-catalog-state page-empty-state">
          <div className="empty-icon">🧺</div>
          <h2>Your basket is empty</h2>
          <p>Add something from the counter before starting a reservation.</p>
          <Link to="/" className="btn btn-primary">
            Browse the counter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-progress" aria-label="Checkout progress">
        <span className="is-complete">Basket</span>
        <span className="is-active">Reserve</span>
        <span>Pay</span>
        <span>Collect</span>
      </div>

      <div className="checkout-heading">
        <span className="section-eyebrow">One last look</span>
        <h1>Review your counter order</h1>
        <p>
          Placing the order starts a {holdLabel} hold. Nothing is charged yet.
        </p>
      </div>

      {activeElsewhere && (
        <div className="inline-notice notice-info">
          <div>
            <strong>You already have a reservation in progress.</strong>
            <span>
              Order #{activeElsewhere.id.slice(0, 8).toUpperCase()} may still be holding
              stock. You can resume it or continue with this new order.
            </span>
          </div>
          <Link to={`/order/${activeElsewhere.id}`} className="btn btn-sm btn-secondary">
            Resume it
          </Link>
        </div>
      )}

      {errorMessage && (
        <div className="checkout-conflict" role="alert">
          <div className="checkout-conflict-icon">!</div>
          <div>
            <strong>
              {errorCode === 'INSUFFICIENT_STOCK'
                ? 'Stock changed before we could reserve it'
                : errorCode === 'PRODUCT_NOT_FOUND'
                  ? 'An item left the counter'
                  : 'We could not reserve your basket'}
            </strong>
            <p>{errorMessage}</p>
            {shortages.length > 0 && (
              <ul className="shortage-list">
                {shortages.map((shortage) => (
                  <li key={shortage.productId}>
                    <span>{shortage.name}</span>
                    <span>
                      {shortage.available === 0
                        ? 'Sold out — removed from basket'
                        : `Only ${shortage.available} of ${shortage.requested} left — quantity updated`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="conflict-help">
              Your basket now reflects the latest stock. Check it over and try again.
            </p>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setErrorMessage(null);
                setErrorCode(null);
                setShortages([]);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="checkout-layout">
        <section className="checkout-items-panel" aria-labelledby="checkout-items-title">
          <div className="panel-heading">
            <h2 id="checkout-items-title">Your items</h2>
            <Link to="/">Add more</Link>
          </div>

          <ul className="checkout-item-list">
            {cart.map((line) => {
              const shortage = shortages.find((item) => item.productId === line.product.id);
              return (
                <li
                  key={line.product.id}
                  className={`checkout-item ${shortage ? 'has-conflict' : ''}`}
                >
                  <ProductImage product={line.product} className="checkout-thumb" />
                  <div className="checkout-item-copy">
                    <Link to={`/product/${line.product.id}`}>
                      <h3>{line.product.name}</h3>
                    </Link>
                    <span>{formatRupees(line.product.pricePaise)} each</span>
                    <span className="checkout-item-stock">
                      {line.product.availableUnits} available at the counter
                    </span>
                  </div>
                  <div className="checkout-item-controls">
                    <div className="quantity-stepper">
                      <button
                        className="stepper-btn"
                        onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                        aria-label={`Decrease ${line.product.name} quantity`}
                      >
                        −
                      </button>
                      <span className="stepper-value">{line.quantity}</span>
                      <button
                        className="stepper-btn"
                        onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                        disabled={line.quantity >= line.product.availableUnits}
                        aria-label={`Increase ${line.product.name} quantity`}
                      >
                        +
                      </button>
                    </div>
                    <span className="checkout-line-total">
                      {formatRupees(line.product.pricePaise * line.quantity)}
                    </span>
                    <button
                      className="btn-remove"
                      onClick={() => removeFromCart(line.product.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="checkout-pickup-note">
            <span className="checkout-pickup-icon">📍</span>
            <div>
              <strong>Pickup at the MetroSober counter</strong>
              <span>Your locker bay is assigned automatically after payment.</span>
            </div>
          </div>
        </section>

        <aside className="checkout-summary-panel" aria-labelledby="order-summary-title">
          <h2 id="order-summary-title">Order summary</h2>

          <div className="summary-row">
            <span>
              Subtotal · {cartCount} {cartCount === 1 ? 'item' : 'items'}
            </span>
            <strong>{formatRupees(cartTotalPaise)}</strong>
          </div>
          <div className="summary-row">
            <span>Counter pickup</span>
            <strong className="summary-free">Free</strong>
          </div>
          <div className="summary-row summary-row-muted">
            <span>Payment</span>
            <span>Next step</span>
          </div>

          <div className="summary-divider"></div>

          <div className="summary-total-row">
            <span>Total</span>
            <strong>{formatRupees(cartTotalPaise)}</strong>
          </div>
          <p className="summary-paise-note">{cartTotalPaise} paise · no hidden charges</p>

          <button
            className="btn btn-primary checkout-place-order"
            onClick={handlePlaceOrder}
            disabled={isSubmitting || cart.length === 0}
          >
            {isSubmitting ? (
              <>
                <span className="spinner"></span> Checking live stock…
              </>
            ) : (
              'Reserve & continue to payment'
            )}
          </button>

          <p className="summary-consent">
            By reserving, you agree that the {holdLabel} hold will expire. Unpaid holds return
            to the shelf automatically.
          </p>

          <div className="summary-trust">
            <div>
              <span>🛡</span>
              <p>
                <strong>Server-verified prices</strong>
                <span>The browser never sends a total.</span>
              </p>
            </div>
            <div>
              <span>⚡</span>
              <p>
                <strong>One shopper wins</strong>
                <span>Stock can’t be sold twice, even in a race.</span>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
