import React from 'react';
import { Product, formatRupees } from '@pickup-counter/shared';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: number, delta: number) => void;
  onRemoveItem: (productId: number) => void;
  onCheckout: () => void;
  isSubmitting: boolean;
  errorMessage?: string | null;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  isSubmitting,
  errorMessage,
}) => {
  if (!isOpen) return null;

  const totalPaise = items.reduce(
    (sum, item) => sum + item.product.pricePaise * item.quantity,
    0,
  );

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <h2 className="drawer-title">Your Order Cart</h2>
            <span className="drawer-subtitle">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close cart">
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="alert alert-error" role="alert">
            <div className="alert-icon">⚠️</div>
            <div className="alert-content">
              <strong>Stock Error</strong>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="empty-cart-state">
              <div className="empty-icon">🛒</div>
              <h3>Your cart is empty</h3>
              <p>Browse our counter selection and add items to begin.</p>
              <button className="btn btn-secondary" onClick={onClose}>
                Browse Products
              </button>
            </div>
          ) : (
            <ul className="cart-item-list">
              {items.map((item) => (
                <li key={item.product.id} className="cart-item">
                  <div className="cart-item-info">
                    <h4 className="cart-item-name">{item.product.name}</h4>
                    <span className="cart-item-unit-price">
                      {formatRupees(item.product.pricePaise)} each
                    </span>
                    <span className="cart-item-subtotal">
                      Subtotal: {formatRupees(item.product.pricePaise * item.quantity)}
                    </span>
                  </div>

                  <div className="cart-item-actions">
                    <div className="quantity-stepper">
                      <button
                        className="stepper-btn"
                        onClick={() => onUpdateQuantity(item.product.id, -1)}
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="stepper-value">{item.quantity}</span>
                      <button
                        className="stepper-btn"
                        onClick={() => onUpdateQuantity(item.product.id, 1)}
                        disabled={item.quantity >= item.product.availableUnits}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      className="btn-remove"
                      onClick={() => onRemoveItem(item.product.id)}
                      title="Remove item"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="drawer-footer">
            <div className="order-summary-row">
              <span>Order Total</span>
              <span className="order-total-price">{formatRupees(totalPaise)}</span>
            </div>
            <p className="hold-policy-notice">
              🔒 Stock is reserved for <strong>120 seconds</strong> once order is placed.
            </p>
            <button
              className="btn btn-primary btn-checkout"
              onClick={onCheckout}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Reserving Stock...' : 'Place Order & Hold Stock'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
