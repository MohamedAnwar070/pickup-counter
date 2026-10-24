import React, { useDeferredValue, useMemo, useState } from 'react';
import { useShop } from '../state/ShopContext';
import { ProductCard } from '../components/ProductCard';
import { formatHoldDuration } from '../common';

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
      showToast('Stock refreshed', 'info');
    } catch {
      showToast('Unable to refresh stock', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const stockSummary = lastStockSync
    ? `Synced ${new Date(lastStockSync).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Syncing stock...';
  const holdLabel = formatHoldDuration(holdSeconds);

  return (
    <section className="catalog-section">
      <div className="catalog-topbar">
        <div>
          <span className="section-eyebrow">Self-Service Counter ({holdLabel} hold)</span>
          <h1 className="section-heading">Available Products</h1>
        </div>
        <div className="stock-sync-pill">
          <span className="live-dot"></span>
          <span>{stockSummary}</span>
        </div>
      </div>

      <div className="catalog-controls-bar">
        <div className="category-pills-list">
          <button
            className={`category-pill ${selectedCategory === 'All' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('All')}
          >
            All ({products.length})
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={`category-pill ${selectedCategory === category ? 'is-active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="catalog-actions-right">
          <label className="search-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="sr-only">Search products</span>
            <input
              type="search"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="search-field"
            />
          </label>

          <button
            className={`btn btn-secondary btn-sm btn-refresh ${isRefreshing ? 'is-refreshing' : ''}`}
            onClick={refreshStock}
            aria-label="Refresh stock"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <span>Connection error: {productsError}</span>
          <button className="alert-inline-action" onClick={refreshStock}>
            Retry
          </button>
        </div>
      )}

      {productsLoading ? (
        <div className="loading-grid">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton-card"></div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-catalog-state">
          <p>No products match your search criteria.</p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
          >
            Reset Filters
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
  );
};
