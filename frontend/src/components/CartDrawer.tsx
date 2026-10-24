import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatRupees, formatHoldDuration } from '../common';
import { useShop } from '../state/ShopContext';
import { ProductImage } from './ProductImage';

export const CartDrawer: React.FC = () => {
  const {
    isCartOpen,
    closeCart,
    cart,
    cartCount,
    cartTotalPaise,
    setQuantity,
    removeFromCart,
    holdSeconds,
  } = useShop();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCartOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCart();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [isCartOpen, closeCart]);

  if (!isCartOpen) return null;

  const goToCheckout = () => {
    closeCart();
    navigate('/checkout');
  };

  return (
    <div className="drawer-overlay" onClick={closeCart}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title" id="cart-title">
              Cart ({cartCount})
            </h2>
            <span className="drawer-subtitle">Items are reserved at checkout</span>
          </div>
          <button className="btn-close" onClick={closeCart} aria-label="Close cart">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {cart.length === 0 ? (
            <div className="empty-cart-state">
              <h3>Your cart is empty</h3>
              <p>Select items from the catalog to start an order.</p>
              <Link className="btn btn-secondary btn-sm" to="/" onClick={closeCart}>
                View Catalog
              </Link>
            </div>
          ) : (
            <ul className="cart-item-list">
              {cart.map((line) => {
                const atLimit = line.quantity >= line.product.availableUnits;
                return (
                  <li key={line.product.id} className="cart-item cart-item-rich">
                    <Link
                      to={`/product/${line.product.id}`}
                      className="cart-thumb-wrap"
                      onClick={closeCart}
                    >
                      <ProductImage product={line.product} className="cart-thumb" />
                    </Link>

                    <div className="cart-item-info">
                      <Link
                        to={`/product/${line.product.id}`}
                        className="cart-item-name-link"
                        onClick={closeCart}
                      >
                        <h4 className="cart-item-name">{line.product.name}</h4>
                      </Link>
                      <span className="cart-item-unit-price">
                        {formatRupees(line.product.pricePaise)} each
                      </span>
                      <span className="cart-item-subtotal">
                        {formatRupees(line.product.pricePaise * line.quantity)}
                      </span>
                      {atLimit && <span className="cart-limit-note">Max available reached</span>}
                    </div>

                    <div className="cart-item-actions">
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
                          disabled={atLimit}
                          aria-label={`Increase ${line.product.name} quantity`}
                        >
                          +
                        </button>
                      </div>

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
          )}
        </div>

        {cart.length > 0 && (
          <div className="drawer-footer">
            <div className="order-summary-row">
              <span>Subtotal</span>
              <span className="order-total-price">{formatRupees(cartTotalPaise)}</span>
            </div>
            <p className="hold-policy-notice">
              Placing the order holds stock for a {formatHoldDuration(holdSeconds)} payment window.
            </p>
            <button className="btn btn-primary btn-checkout" onClick={goToCheckout}>
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
