import React from 'react';
import { Product, formatRupees } from '@pickup-counter/shared';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  cartQuantity: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  cartQuantity,
}) => {
  const isOutOfStock = product.availableUnits <= 0;
  const isMaxInCart = cartQuantity >= product.availableUnits;

  // Visual category icons based on product name
  const getProductIcon = (name: string) => {
    if (name.toLowerCase().includes('sourdough')) {
      return '🥖';
    } else if (name.toLowerCase().includes('brew') || name.toLowerCase().includes('coffee')) {
      return '☕';
    } else if (name.toLowerCase().includes('mug')) {
      return '🏺';
    } else if (name.toLowerCase().includes('honey')) {
      return '🍯';
    } else if (name.toLowerCase().includes('beans')) {
      return '🫘';
    }
    return '📦';
  };

  return (
    <div className={`product-card ${isOutOfStock ? 'is-out-of-stock' : ''}`}>
      <div className="product-image-container">
        <div className="product-icon-wrap">
          <span className="product-emoji">{getProductIcon(product.name)}</span>
        </div>
        <div className="stock-badge-container">
          {isOutOfStock ? (
            <span className="badge badge-soldout">Unavailable / Held</span>
          ) : product.availableUnits <= 2 ? (
            <span className="badge badge-warning">Only {product.availableUnits} left</span>
          ) : (
            <span className="badge badge-instock">{product.availableUnits} Available</span>
          )}
        </div>
      </div>

      <div className="product-details">
        <h3 className="product-title">{product.name}</h3>
        <div className="product-meta">
          <span className="product-price">{formatRupees(product.pricePaise)}</span>
          <span className="product-stock-subtext">Total Stock: {product.stock}</span>
        </div>

        <button
          className={`btn ${isOutOfStock ? 'btn-disabled' : 'btn-primary'}`}
          disabled={isOutOfStock || isMaxInCart}
          onClick={() => onAddToCart(product)}
        >
          {isOutOfStock ? (
            'Sold Out / Held'
          ) : isMaxInCart ? (
            'Max Available in Cart'
          ) : cartQuantity > 0 ? (
            `Add Another (${cartQuantity} in cart)`
          ) : (
            'Add to Cart'
          )}
        </button>
      </div>
    </div>
  );
};
