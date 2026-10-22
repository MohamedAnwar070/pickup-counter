import React, { useEffect, useState, useCallback } from 'react';
import { Product } from '@pickup-counter/shared';
import { fetchProducts, createOrder } from './api/client';
import { Navbar } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { CartDrawer, CartItem } from './components/CartDrawer';
import { PaymentModal } from './components/PaymentModal';

export const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [cartErrorMessage, setCartErrorMessage] = useState<string | null>(null);

  // Active Checkout / Payment State
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    totalPaise: number;
    expiresInSeconds: number;
  } | null>(null);

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

      // Re-fetch products to show newly held units immediately
      loadProducts();
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCartErrorMessage(
        err.message || 'Could not place order. Inventory may have changed.',
      );
      // Auto-refresh products on stock shortage as required by R9 / H5
      await loadProducts();
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="app-layout">
      <Navbar cartCount={totalCartCount} onOpenCart={() => setIsCartOpen(true)} />

      <main className="main-content">
        {/* Hero Section */}
        <section className="hero-banner">
          <div className="hero-content">
            <span className="hero-eyebrow">Fresh Daily · Counter Collection</span>
            <h1 className="hero-heading">Craft Goods, Held Exclusively For You</h1>
            <p className="hero-description">
              Select handmade sourdough, cold brews, and mountain provisions. Place an order to hold units on the counter for <strong>120 seconds</strong>, complete payment, and collect instantly at the locker.
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
                <span className="stat-lbl">Exact Accounting</span>
              </div>
            </div>
          </div>
        </section>

        {/* Catalog Section */}
        <section className="catalog-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Counter Provisions</h2>
              <p className="section-subtitle">Real-time stock with atomic hold locks</p>
            </div>
            <button className="btn btn-secondary btn-refresh" onClick={loadProducts}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh Stock
            </button>
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
          ) : (
            <div className="products-grid">
              {products.map((product) => {
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
