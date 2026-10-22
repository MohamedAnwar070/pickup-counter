import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatRupees } from '@pickup-counter/shared';
import { useShop } from '../state/ShopContext';
import { ProductCard } from '../components/ProductCard';
import { ProductImage } from '../components/ProductImage';
import { formatHoldDuration } from '../utils/hold';

export const ProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { products, productsLoading, addToCart, showToast, openCart, holdSeconds } = useShop();
  const product = products.find((item) => String(item.id) === id);
  const [quantity, setQuantity] = useState<number>(1);

  useEffect(() => {
    setQuantity(1);
  }, [id]);

  const relatedProducts = useMemo(() => {
    if (!product) return products.filter((item) => item.availableUnits > 0).slice(0, 3);
    return products
      .filter((item) => item.id !== product.id && item.availableUnits > 0)
      .sort((a, b) => (a.category === product.category ? -1 : 0) - (b.category === product.category ? -1 : 0))
      .slice(0, 3);
  }, [products, product]);

  if (productsLoading && !product) {
    return <div className="page-loading-shell">Loading the counter shelf…</div>;
  }

  if (!product) {
    return (
      <div className="empty-catalog-state page-empty-state">
        <h2>That item is no longer on the shelf</h2>
        <p>It may have sold out or been removed from the counter.</p>
        <Link to="/" className="btn btn-primary">
          Back to the shop
        </Link>
      </div>
    );
  }

  const heldByOthers = Math.max(0, product.stock - product.availableUnits);
  const isOutOfStock = product.availableUnits <= 0;
  const maxQuantity = Math.max(1, product.availableUnits);
  const holdLabel = formatHoldDuration(holdSeconds);

  const handleAdd = () => {
    const result = addToCart(product, quantity);
    if (result.added > 0) {
      showToast(
        `${result.added} × ${product.name} added to your basket`,
      );
    } else if (result.capped) {
      showToast(`Only ${product.availableUnits} available right now`, 'error');
    } else {
      showToast('This item is currently unavailable', 'error');
    }
  };

  const handleBuyNow = () => {
    const result = addToCart(product, quantity);
    if (result.added > 0) {
      openCart();
    } else {
      showToast('This item is no longer available', 'error');
    }
  };

  return (
    <div className="product-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Shop</Link>
        <span>/</span>
        <span>{product.category}</span>
        <span>/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <section className="product-hero">
        <div className="product-hero-media">
          <ProductImage product={product} className="product-hero-image" />
          <span className="product-hero-category">{product.category}</span>
          {heldByOthers > 0 && (
            <span className="product-hero-held">
              {heldByOthers} reserved by other shoppers
            </span>
          )}
        </div>

        <div className="product-hero-info">
          <span className="section-eyebrow">{product.tagline || 'MetroSober counter favourite'}</span>
          <h1>{product.name}</h1>
          <p className="product-hero-description">
            {product.description || 'A small-batch MetroSober provision, made for the counter.'}
          </p>

          <div className="product-hero-price-row">
            <span className="product-hero-price">{formatRupees(product.pricePaise)}</span>
            <span className={`availability-chip ${isOutOfStock ? 'is-out' : ''}`}>
              <span className="mini-dot"></span>
              {isOutOfStock ? 'Currently unavailable' : `${product.availableUnits} available now`}
            </span>
          </div>

          <div className="stock-breakdown">
            <div>
              <span>Batch stock</span>
              <strong>{product.stock}</strong>
            </div>
            <div>
              <span>Held by others</span>
              <strong>{heldByOthers}</strong>
            </div>
            <div>
              <span>Ready to reserve</span>
              <strong>{product.availableUnits}</strong>
            </div>
          </div>

          <div className="product-buy-row">
            <div className="quantity-stepper quantity-stepper-large" aria-label="Select quantity">
              <button
                className="stepper-btn"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="stepper-value">{quantity}</span>
              <button
                className="stepper-btn"
                onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
                disabled={quantity >= maxQuantity}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <button
              className="btn btn-primary product-add-large"
              onClick={handleAdd}
              disabled={isOutOfStock}
            >
              {isOutOfStock ? 'Unavailable' : `Add ${quantity} to basket`}
            </button>
          </div>

          <button
            className="btn btn-secondary product-buy-now"
            onClick={handleBuyNow}
            disabled={isOutOfStock}
          >
            Buy now — review basket
          </button>

          <div className="product-reassurance">
            <div>
              <span>⏱</span>
              <p>
                <strong>{holdLabel} hold</strong>
                <span>Your stock is reserved while you pay.</span>
              </p>
            </div>
            <div>
              <span>🔐</span>
              <p>
                <strong>Locker pickup</strong>
                <span>Bay and pickup code appear after payment.</span>
              </p>
            </div>
            <div>
              <span>↺</span>
              <p>
                <strong>Come back anytime</strong>
                <span>Your order stays in “My reservations” on this device.</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="related-section">
          <div className="section-heading-row">
            <div>
              <span className="section-eyebrow">Keep exploring</span>
              <h2 className="section-heading">More from the counter</h2>
            </div>
          </div>
          <div className="products-grid products-grid-three">
            {relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
