import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Product } from '@pickup-counter/shared';
import { fetchProducts, createOrder } from './api/client';
import { Navbar } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { CartDrawer, CartItem } from './components/CartDrawer';
import { PaymentModal } from './components/PaymentModal';
import { sound } from './utils/audio';

export const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [cartErrorMessage, setCartErrorMessage] = useState<string | null>(null);

  // Category filter and search
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Checkout / Payment State
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    totalPaise: number;
    expiresInSeconds: number;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  const loadProducts = useCallback(async () => {
    try {
      setProductError(null);
      const data = await fetchProducts();
      setProducts(data);
    } catch (err: any) {
      console.error('Failed to load products:', err);
      setProductError(err.message || 'Could not load counter inventory');
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAddToCart = (product: Product) => {
    setCartErrorMessage(null);
    sound.playAddToCart();
    showToast(`Added "${product.name}" to cart`);

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.availableUnits) return prevCart;
        return prevCart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: number, delta: number) => {
    setCartErrorMessage(null);
    sound.playAddToCart();
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveItem = (productId: number) => {
    setCartErrorMessage(null);
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmittingOrder(true);
    setCartErrorMessage(null);

    try {
      const orderItems = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      }));

      const response = await createOrder(orderItems);

      // Successfully placed order and reserved stock
      setActiveOrder({
        orderId: response.orderId,
        totalPaise: response.totalPaise,
        expiresInSeconds: response.expiresInSeconds,
      });

      // Clear cart & close drawer
      setCart([]);
      setIsCartOpen(false);

      showToast('🔒 Stock reserved! 120s hold window activated');
      loadProducts();
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCartErrorMessage(
        err.message || 'Could not place order. Inventory may have changed.',
      );
      await loadProducts();
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'bakery') return prod.name.toLowerCase().includes('sourdough');
      if (selectedCategory === 'beverage') return prod.name.toLowerCase().includes('brew') || prod.name.toLowerCase().includes('beans');
      if (selectedCategory === 'craft') return prod.name.toLowerCase().includes('mug');
      if (selectedCategory === 'pantry') return prod.name.toLowerCase().includes('honey');
      return true;
    });
  }, [products, searchQuery, selectedCategory]);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="app-layout">
      <Navbar cartCount={totalCartCount} onOpenCart={() => setIsCartOpen(true)} />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="main-content">
        {/* Hero Section */}
        <section className="hero-banner">
          <div className="hero-content">
            <span className="hero-eyebrow">MetroSober Provisions · Counter Collection</span>
            <h1 className="hero-heading">Craft Goods, Held Exclusively For You</h1>
            <p className="hero-description">
              Handmade sourdough, cold brew extractions, and organic mountain harvests. Place an order to hold units on the counter for <strong>120 seconds</strong>, pay securely with UPI or card, and unlock your pickup locker.
            </p>
            <div className="hero-stats">
              <div className="stat-pill">
                <span className="stat-num">120s</span>
                <span className="stat-lbl">Fair Hold Window</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">100%</span>
                <span className="stat-lbl">Concurrency Safe</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">₹ Paise</span>
                <span className="stat-lbl">Integer Accounting</span>
              </div>
            </div>
          </div>
        </section>

        {/* Catalog Section */}
        <section className="catalog-section">
          <div className="catalog-controls-bar">
            {/* Category Filter Pills */}
            <div className="category-pills-list">
              <button
                className={`category-pill ${selectedCategory === 'all' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All Provisions
              </button>
              <button
                className={`category-pill ${selectedCategory === 'bakery' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('bakery')}
              >
                🥖 Bakery
              </button>
              <button
                className={`category-pill ${selectedCategory === 'beverage' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('beverage')}
              >
                ☕ Cold Brew & Roasts
              </button>
              <button
                className={`category-pill ${selectedCategory === 'craft' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('craft')}
              >
                🏺 Studio Ceramics
              </button>
              <button
                className={`category-pill ${selectedCategory === 'pantry' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('pantry')}
              >
                🍯 Mountain Pantry
              </button>
            </div>

            {/* Search and Refresh */}
            <div className="catalog-actions-right">
              <div className="search-input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search provisions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-field"
                />
              </div>

              <button className="btn btn-secondary btn-refresh" onClick={loadProducts}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Refresh Stock
              </button>
            </div>
          </div>

          {productError && (
            <div className="alert alert-error">
              <strong>Connection Error:</strong> {productError}
            </div>
          )}

          {isLoadingProducts ? (
            <div className="loading-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-card"></div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-catalog-state">
              <p>No provisions matched your search criteria.</p>
              <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="products-grid">
              {filteredProducts.map((product) => {
                const inCart = cart.find((i) => i.product.id === product.id)?.quantity || 0;
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={handleAddToCart}
                    cartQuantity={inCart}
                  />
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onCheckout={handleCheckout}
        isSubmitting={isSubmittingOrder}
        errorMessage={cartErrorMessage}
      />

      {/* Active Order & Payment Modal */}
      {activeOrder && (
        <PaymentModal
          orderId={activeOrder.orderId}
          initialExpiresInSeconds={activeOrder.expiresInSeconds}
          totalPaise={activeOrder.totalPaise}
          onClose={() => {
            setActiveOrder(null);
            loadProducts();
          }}
          onOrderUpdated={loadProducts}
        />
      )}

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-container">
          <p>© 2026 Pickup Counter · MetroSober Brand Design System · TypeScript + NestJS + React</p>
        </div>
      </footer>
    </div>
  );
};
