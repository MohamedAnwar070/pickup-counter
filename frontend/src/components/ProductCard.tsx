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

  // Real product imagery mapping
  const getProductImage = (name: string): { src: string; tag: string; description: string } => {
    const n = name.toLowerCase();
    if (n.includes('sourdough')) {
      return {
        src: '/products/sourdough.jpg',
        tag: 'Baked Fresh at 6 AM',
        description: 'Naturally fermented 36-hour dough with a crackling blistered crust.',
      };
    } else if (n.includes('brew')) {
      return {
        src: '/products/coldbrew.jpg',
        tag: 'Steeped 20 Hours',
        description: 'Single-origin Arabica cold water extraction with chocolate undertones.',
      };
    } else if (n.includes('mug')) {
      return {
        src: '/products/ceramic-mug.jpg',
        tag: 'Studio Hand-thrown',
        description: 'Earthy terracotta with a speckled ivory food-safe matte glaze.',
      };
    } else if (n.includes('honey')) {
      return {
        src: '/products/honey.jpg',
        tag: '100% Raw & Wild',
        description: 'Unprocessed high-altitude wildflower honey harvested from forest hives.',
      };
    } else if (n.includes('beans')) {
      return {
        src: '/products/coffee-beans.jpg',
        tag: 'Medium-Dark Roast',
        description: 'Estate-grown whole beans roasted weekly in small artisan batches.',
      };
    }
    return {
      src: '/products/sourdough.jpg',
      tag: 'Counter Special',
      description: 'Artisanal provisions crafted with sustainable local ingredients.',
    };
  };

  const { src, tag, description } = getProductImage(product.name);

  return (
    <div className={`product-card ${isOutOfStock ? 'is-out-of-stock' : ''}`}>
      <div className="product-image-container">
        <img
          src={src}
          alt={product.name}
          className="product-photo"
          loading="lazy"
        />
        <div className="product-overlay-gradient"></div>
        <span className="product-curator-tag">{tag}</span>

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
        <p className="product-description-text">{description}</p>

        <div className="product-meta">
          <div className="price-stack">
            <span className="product-price">{formatRupees(product.pricePaise)}</span>
            <span className="product-stock-subtext">Batch Stock: {product.stock}</span>
          </div>

          <button
            className={`btn ${isOutOfStock ? 'btn-disabled' : 'btn-primary'}`}
            disabled={isOutOfStock || isMaxInCart}
            onClick={() => onAddToCart(product)}
            aria-label={`Add ${product.name} to cart`}
          >
            {isOutOfStock ? (
              'Sold Out'
            ) : isMaxInCart ? (
              'Max in Cart'
            ) : cartQuantity > 0 ? (
              `Add (+${cartQuantity})`
            ) : (
              'Add to Cart'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
