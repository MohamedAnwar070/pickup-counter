import React, { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { formatRupees, formatHoldDuration } from '../common';
import { useOrders } from '../state/OrdersContext';
import { useShop } from '../state/ShopContext';
import { CartDrawer } from './CartDrawer';
import { Navbar } from './Navbar';

const ActiveReservationBanner: React.FC = () => {
  const { activeOrder } = useOrders();
  const location = useLocation();

  if (!activeOrder || location.pathname.startsWith('/order/')) return null;

  const label =
    activeOrder.status === 'paid'
      ? 'Your order is paid — collect it from the locker'
      : activeOrder.status === 'needs_review'
        ? 'Your payment needs a quick counter review'
        : 'A reservation is in progress';

  return (
    <div className={`active-reservation-banner tone-${activeOrder.status}`}>
      <div className="active-reservation-inner">
        <div className="active-reservation-copy">
          <span className="active-reservation-dot"></span>
          <div>
            <strong>{label}</strong>
            <span>
              Order #{activeOrder.id.slice(0, 8).toUpperCase()} ·{' '}
              {formatRupees(activeOrder.totalPaise)}
            </span>
          </div>
        </div>
        <Link to={`/order/${activeOrder.id}`} className="btn btn-sm btn-primary">
          Resume order
        </Link>
      </div>
    </div>
  );
};

const MobileCartBar: React.FC = () => {
  const { cartCount, cartTotalPaise, openCart, isCartOpen } = useShop();
  const location = useLocation();

  if (cartCount === 0 || isCartOpen || location.pathname === '/checkout') return null;

  return (
    <div className="mobile-cart-bar">
      <button onClick={openCart}>
        <span className="mobile-cart-count">{cartCount}</span>
        <span>View basket</span>
        <strong>{formatRupees(cartTotalPaise)}</strong>
      </button>
    </div>
  );
};

export const Layout: React.FC = () => {
  const { toast, clearToast, holdSeconds } = useShop();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <Navbar />
      <ActiveReservationBanner />

      {toast && (
        <div className={`toast-notification toast-${toast.tone}`} role="status">
          <span>{toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}</span>
          <span>{toast.message}</span>
          <button className="toast-close" onClick={clearToast} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      )}

      <main className="main-content">
        <Outlet />
      </main>

      <CartDrawer />
      <MobileCartBar />

      <footer className="app-footer">
        <div className="footer-container footer-grid">
          <div>
            <span className="footer-brand">Pickup Counter</span>
            <p>MetroSober artisanal goods, held with care at the counter.</p>
          </div>
          <div className="footer-links">
            <Link to="/">Shop</Link>
            <Link to="/orders">My reservations</Link>
            <Link to="/how-it-works">How it works</Link>
          </div>
          <div className="footer-meta">
            <span>{formatHoldDuration(holdSeconds)} stock holds</span>
            <span>Server-verified pricing</span>
            <span>No overselling</span>
          </div>
        </div>
        <p className="footer-fineprint">
          Demo checkout for this build · prices shown in ₹ include the exact paise stored
          server-side.
        </p>
      </footer>
    </div>
  );
};
