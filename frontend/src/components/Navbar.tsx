import React from 'react';
import { NavLink } from 'react-router-dom';
import { useOrders } from '../state/OrdersContext';
import { useShop } from '../state/ShopContext';

export const Navbar: React.FC = () => {
  const { cartCount, openCart, productsError } = useShop();
  const { orders } = useOrders();

  return (
    <header className="navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-brand" aria-label="Pickup Counter home">
          <div className="brand-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-title">PICKUP COUNTER</span>
            <span className="brand-subtitle">MetroSober Artisanal Goods</span>
          </div>
        </NavLink>

        <nav className="nav-links" aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}>
            Shop
          </NavLink>
          <NavLink
            to="/orders"
            className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
          >
            My reservations
            {orders.length > 0 && <span className="nav-count">{orders.length}</span>}
          </NavLink>
          <NavLink
            to="/how-it-works"
            className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
          >
            How it works
          </NavLink>
        </nav>

        <div className="navbar-actions">
          <div className={`status-indicator ${productsError ? 'is-offline' : ''}`}>
            <span className="status-dot"></span>
            <span className="status-text">{productsError ? 'Counter offline' : 'Counter live'}</span>
          </div>

          <button
            className="cart-toggle-btn"
            onClick={openCart}
            aria-label={`View shopping cart with ${cartCount} items`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span className="cart-label">Cart</span>
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
};
