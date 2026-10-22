import React from 'react';
import { Link } from 'react-router-dom';
import { Product, formatRupees } from '@pickup-counter/shared';
import { useShop } from '../state/ShopContext';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: Product;
}

const categoryIcons: Record<string, string> = {
  Bakery: '🥖',
  'Cold Brew & Roasts': '☕',
  'Studio Ceramics': '🏺',
  'Mountain Pantry': '🍯',
};

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { cart, addToCart, showToast } = useShop();
  const cartQuantity = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
  const isOutOfStock = product.availableUnits <= 0;
  const isSoldOut = product.stock <= 0;
  const isMaxInCart = cartQuantity >= product.availableUnits;
  const heldByOthers = Math.max(0, product.stock - product.availableUnits);

  const handleAdd = () => {
    const result = addToCart(product);
    if (result.added > 0) {
      showToast(`${product.name} added to cart`);
    } else if (result.capped) {
      showToast(`Only ${product.availableUnits} available right now`, 'error');
    } else {
      showToast('This item is currently unavailable', 'error');
    }
  };

  return (
    <article className={`product-card ${isOutOfStock ? 'is-out-of-stock' : ''}`}>
      <Link to={`/product/${product.id}`} className="product-image-link" aria-label={`View ${product.name}`}>
        <div className="product-image-container">
          <ProductImage product={product} className="product-photo" />
          <div className="product-overlay-gradient"></div>
          <span className="product-curator-tag">
            {categoryIcons[product.category] ? `${categoryIcons[product.category]} ` : ''}
            {product.category || 'Counter special'}
          </span>

          <div className="stock-badge-container">
            {isOutOfStock ? (
              <span className="badge badge-soldout">
                {isSoldOut ? 'Sold out' : 'Fully held'}
              </span>
            ) : product.availableUnits <= 2 ? (
              <span className="badge badge-warning">Only {product.availableUnits} left</span>
            ) : (
              <span className="badge badge-instock">{product.availableUnits} available</span>
            )}
          </div>
        </div>
      </Link>

      <div className="product-details">
        <span className="product-tagline">{product.tagline || 'Small-batch counter goods'}</span>
        <Link to={`/product/${product.id}`} className="product-title-link">
          <h3 className="product-title">{product.name}</h3>
        </Link>
        <p className="product-description-text">{product.description || 'A MetroSober counter favourite.'}</p>

        {heldByOthers > 0 && !isOutOfStock && (
          <p className="held-note">
            <span className="mini-dot"></span>
            {heldByOthers} unit{heldByOthers === 1 ? '' : 's'} currently reserved by other shoppers
          </p>
        )}

        <div className="product-meta">
          <div className="price-stack">
            <span className="product-price">{formatRupees(product.pricePaise)}</span>
            <span className="product-stock-subtext">Batch stock: {product.stock}</span>
          </div>

          <button
            className={`btn ${isOutOfStock ? 'btn-disabled' : 'btn-primary'}`}
            disabled={isOutOfStock || isMaxInCart}
            onClick={handleAdd}
            aria-label={`Add ${product.name} to cart`}
          >
            {isOutOfStock ? (
              isSoldOut ? (
                'Sold out'
              ) : (
                'Fully held'
              )
            ) : isMaxInCart ? (
              'Max in cart'
            ) : cartQuantity > 0 ? (
              `Add another (${cartQuantity})`
            ) : (
              'Add to cart'
            )}
          </button>
        </div>
      </div>
    </article>
  );
};
