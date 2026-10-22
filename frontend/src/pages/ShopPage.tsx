import React, { useDeferredValue, useMemo, useState } from 'react';
import { useShop } from '../state/ShopContext';
import { ProductCard } from '../components/ProductCard';
import { formatHoldDuration } from '../utils/hold';

const categoryIcons: Record<string, string> = {
  Bakery: '🥖',
  'Cold Brew & Roasts': '☕',
  'Studio Ceramics': '🏺',
  'Mountain Pantry': '🍯',
};

export const ShopPage: React.FC = () => {
  const {
    products,
    productsLoading,
    productsError,
    lastStockSync,
    refreshProducts,
    showToast,
    holdSeconds,
  } = useShop();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const deferredSearch = useDeferredValue(searchQuery);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'All' || product.category === selectedCategory;
      const matchesQuery =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [products, selectedCategory, deferredSearch]);

  const refreshStock = async () => {
    setIsRefreshing(true);
    try {
      await refreshProducts(true);
      showToast('Counter stock refreshed', 'info');
    } catch {
      showToast('Could not refresh stock. Check the counter connection.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const stockSummary = lastStockSync
    ? `Stock synced ${new Date(lastStockSync).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Syncing live stock…';
  const holdLabel = formatHoldDuration(holdSeconds);
  const holdClock = `${String(Math.floor(holdSeconds / 60)).padStart(2, '0')}:${String(
    holdSeconds % 60,
  ).padStart(2, '0')}`;

  return (
    <>
      <section className="hero-banner hero-grid">
        <div className="hero-content">
          <span className="hero-eyebrow">MetroSober Provisions · Counter Collection</span>
          <h1 className="hero-heading">Good things, held just for you.</h1>
          <p className="hero-description">
            Small-batch bread, coffee and ceramics from the MetroSober counter. Reserve
            what you want for a {holdLabel} hold, pay from your phone, then collect from
            your locker at the shop.
          </p>
          <div className="hero-actions">
            <a href="#catalog" className="btn btn-primary hero-primary-cta">
              Shop the counter
            </a>
            <a href="#how-it-works" className="btn btn-secondary hero-secondary-cta">
              How pickup works
            </a>
          </div>
          <div className="hero-stats">
            <div className="stat-pill">
              <span className="stat-num">{Math.max(1, Math.round(holdSeconds / 60))} min</span>
              <span className="stat-lbl">Exclusive hold</span>
            </div>
            <div className="stat-pill">
              <span className="stat-num">Live</span>
              <span className="stat-lbl">Counter stock</span>
            </div>
            <div className="stat-pill">
              <span className="stat-num">1</span>
              <span className="stat-lbl">Winner per pickup</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-photo-frame">
            <img
              src="/images/products/sourdough.jpg"
              alt=""
              className="hero-photo"
              loading="eager"
            />
            <div className="hero-photo-shade"></div>
            <div className="hero-photo-caption">
              <span>Fresh at the counter</span>
              <strong>36-hour sourdough</strong>
            </div>
          </div>
          <div className="hero-float-card hero-float-stock">
            <span className="hero-float-kicker">Your hold</span>
            <strong>{holdClock}</strong>
            <span>before it goes back to the shelf</span>
          </div>
          <div className="hero-float-card hero-float-pickup">
            <span className="hero-float-icon">🔐</span>
            <div>
              <strong>Locker ready</strong>
              <span>Pick up without queueing</span>
            </div>
          </div>
        </div>
      </section>

      <section className="counter-trust-strip" aria-label="Why shop here">
        <div>
          <span className="trust-icon">✓</span>
          <div>
            <strong>Real-time availability</strong>
            <span>Reservations are counted the moment they start.</span>
          </div>
        </div>
        <div>
          <span className="trust-icon">₹</span>
          <div>
            <strong>Server-verified totals</strong>
            <span>Prices come from the counter, never the browser.</span>
          </div>
        </div>
        <div>
          <span className="trust-icon">↺</span>
          <div>
            <strong>No lost orders</strong>
            <span>Every reservation can be resumed from this device.</span>
          </div>
        </div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">Today at the counter</span>
            <h2 className="section-heading">The counter shelf</h2>
          </div>
          <div className="stock-sync-pill">
            <span className="live-dot"></span>
            {stockSummary}
          </div>
        </div>

        <div className="catalog-controls-bar catalog-controls-updated">
          <div className="category-pills-list">
            <button
              className={`category-pill ${selectedCategory === 'All' ? 'is-active' : ''}`}
              onClick={() => setSelectedCategory('All')}
            >
              Everything
            </button>
            {categories.map((category) => (
              <button
                key={category}
                className={`category-pill ${selectedCategory === category ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {categoryIcons[category] ? `${categoryIcons[category]} ` : ''}
                {category}
              </button>
            ))}
          </div>

          <div className="catalog-actions-right">
            <label className="search-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="sr-only">Search provisions</span>
              <input
                type="search"
                placeholder="Search provisions…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="search-field"
              />
            </label>

            <button
              className={`btn btn-secondary btn-refresh ${isRefreshing ? 'is-refreshing' : ''}`}
              onClick={refreshStock}
              aria-label="Refresh live stock"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {productsError && (
          <div className="alert alert-error" role="alert">
            <strong>Connection error.</strong> {productsError}
            <button className="alert-inline-action" onClick={refreshStock}>
              Retry
            </button>
          </div>
        )}

        {productsLoading ? (
          <div className="loading-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton-card"></div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-catalog-state">
            <p>No provisions match that search.</p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="how-it-works-section" id="how-it-works">
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">No queues, no guesswork</span>
            <h2 className="section-heading">How counter pickup works</h2>
          </div>
        </div>
        <div className="steps-grid">
          <div className="step-card">
            <span className="step-number">01</span>
            <h3>Choose your goods</h3>
            <p>Add what you want to your basket. Live availability is shown on every card.</p>
          </div>
          <div className="step-card">
            <span className="step-number">02</span>
            <h3>Reserve for a {holdLabel} hold</h3>
            <p>When you place the order, the counter holds your units and starts the timer.</p>
          </div>
          <div className="step-card">
            <span className="step-number">03</span>
            <h3>Pay from your phone</h3>
            <p>Pay while the hold is active. Your order page stays here if you need to come back.</p>
          </div>
          <div className="step-card">
            <span className="step-number">04</span>
            <h3>Open your locker</h3>
            <p>Your bay number and pickup code appear after payment. Collect and you’re done.</p>
          </div>
        </div>
      </section>
    </>
  );
};
