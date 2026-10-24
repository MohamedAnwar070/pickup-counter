import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatRupees, StockShortage, formatHoldDuration } from '../common';
import { ApiError, createOrder } from '../api/client';
import { useOrders } from '../state/OrdersContext';
import { useShop } from '../state/ShopContext';
import { ProductImage } from '../components/ProductImage';

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
      showToast('Stock reserved. Complete payment before the timer ends.');
      navigate(`/order/${response.orderId}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_STOCK') {
        const affected = error.details?.shortages ?? [];
        setShortages(affected);
        setErrorCode(error.code);
        setErrorMessage(error.message);
        reconcileCart(affected);
        await refreshProducts(true).catch(() => undefined);
        showToast('Stock changed. Cart quantities updated.', 'error');
      } else if (error instanceof ApiError) {
        setErrorCode(error.code);
        setErrorMessage(error.message);
        if (error.code === 'PRODUCT_NOT_FOUND') {
          await refreshProducts(true).catch(() => undefined);
        }
      } else {
        setErrorMessage('Could not connect to server. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <div className="empty-catalog-state page-empty-state">
          <h2>Your cart is empty</h2>
          <p>Add items from the catalog before placing a reservation.</p>
          <Link to="/" className="btn btn-primary btn-sm">
            Browse Catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-header-row">
        <div>
          <span className="section-eyebrow">Step 2 of 4: Reserve Stock</span>
          <h1>Checkout</h1>
        </div>
        <div className="checkout-progress" aria-label="Checkout progress">
          <span className="is-complete">1. Cart</span>
          <span className="is-active">2. Reserve</span>
          <span>3. Pay</span>
          <span>4. Pickup</span>
        </div>
      </div>

      {activeElsewhere && (
        <div className="inline-notice notice-info">
          <div>
            <strong>Pending order #{activeElsewhere.id.slice(0, 8).toUpperCase()}</strong>
            <span>You already have an active reservation holding stock.</span>
          </div>
          <Link to={`/order/${activeElsewhere.id}`} className="btn btn-sm btn-secondary">
            Open Existing Order
          </Link>
        </div>
      )}

      {errorMessage && (
        <div className="checkout-conflict" role="alert">
          <div className="checkout-conflict-icon">!</div>
          <div>
            <strong>
              {errorCode === 'INSUFFICIENT_STOCK'
                ? 'Insufficient stock for requested quantities'
                : 'Unable to reserve items'}
            </strong>
            <p>{errorMessage}</p>
            {shortages.length > 0 && (
              <ul className="shortage-list">
                {shortages.map((shortage) => (
                  <li key={shortage.productId}>
                    <span>{shortage.name}</span>
                    <span>
                      {shortage.available === 0
                        ? 'Out of stock (removed)'
                        : `${shortage.available} of ${shortage.requested} available (updated)`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
            <h2 id="checkout-items-title">Items ({cartCount})</h2>
            <Link to="/">Add more items</Link>
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
                    <span>
                      {formatRupees(line.product.pricePaise)} each · {line.product.availableUnits} available
                    </span>
                  </div>
                  <div className="checkout-item-controls">
                    <div className="quantity-stepper">
                      <button
                        className="stepper-btn"
                        onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                        aria-label={`Decrease ${line.product.name} quantity`}
                      >
                        -
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
        </section>

        <aside className="checkout-summary-panel" aria-labelledby="order-summary-title">
          <h2 id="order-summary-title">Order Summary</h2>

          <div className="summary-row">
            <span>Items ({cartCount})</span>
            <strong>{formatRupees(cartTotalPaise)}</strong>
          </div>
          <div className="summary-row">
            <span>Counter Pickup</span>
            <strong className="summary-free">Free</strong>
          </div>
          <div className="summary-row">
            <span>Hold Window</span>
            <span>{holdLabel}</span>
          </div>

          <div className="summary-divider"></div>

          <div className="summary-total-row">
            <span>Total</span>
            <strong>{formatRupees(cartTotalPaise)}</strong>
          </div>
          <p className="summary-paise-note">{cartTotalPaise} paise (server-verified at order creation)</p>

          <button
            className="btn btn-primary checkout-place-order"
            onClick={handlePlaceOrder}
            disabled={isSubmitting || cart.length === 0}
          >
            {isSubmitting ? (
              <>
                <span className="spinner"></span> Reserving stock...
              </>
            ) : (
              'Reserve Stock & Continue to Payment'
            )}
          </button>

          <p className="summary-consent">
            Unpaid reservations expire automatically after the {holdLabel} hold window and return stock to the catalog.
          </p>
        </aside>
      </div>
    </div>
  );
};
