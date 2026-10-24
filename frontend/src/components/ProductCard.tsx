import React from 'react';
import { Link } from 'react-router-dom';
import { Product, formatRupees } from '../common';
import { useShop } from '../state/ShopContext';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: Product;
}

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
      showToast(`Only ${product.availableUnits} available`, 'error');
    } else {
      showToast('Item unavailable', 'error');
    }
  };

  return (
    <article className={`product-card ${isOutOfStock ? 'is-out-of-stock' : ''}`}>
      <Link to={`/product/${product.id}`} className="product-image-link" aria-label={`View ${product.name}`}>
        <div className="product-image-container">
          <ProductImage product={product} className="product-photo" />
          <span className="product-curator-tag">{product.category || 'Counter'}</span>
          <div className="stock-badge-container">
            {isOutOfStock ? (
              <span className="badge badge-soldout">{isSoldOut ? 'Sold out' : 'All held'}</span>
            ) : product.availableUnits <= 2 ? (
              <span className="badge badge-warning">{product.availableUnits} left</span>
            ) : (
              <span className="badge badge-instock">{product.availableUnits} available</span>
            )}
          </div>
        </div>
      </Link>

      <div className="product-details">
        <Link to={`/product/${product.id}`} className="product-title-link">
          <h3 className="product-title">{product.name}</h3>
        </Link>
        <p className="product-description-text">{product.description}</p>

        {heldByOthers > 0 && !isOutOfStock && (
          <p className="held-note">
            <span className="mini-dot"></span>
            {heldByOthers} reserved by other shoppers
          </p>
        )}

        <div className="product-meta">
          <div className="price-stack">
            <span className="product-price">{formatRupees(product.pricePaise)}</span>
            <span className="product-stock-subtext">Stock: {product.stock}</span>
          </div>

          <button
            className={`btn btn-sm ${isOutOfStock ? 'btn-disabled' : 'btn-primary'}`}
            disabled={isOutOfStock || isMaxInCart}
            onClick={handleAdd}
            aria-label={`Add ${product.name} to cart`}
          >
            {isOutOfStock
              ? isSoldOut
                ? 'Sold out'
                : 'Held'
              : isMaxInCart
                ? `In cart (${cartQuantity})`
                : cartQuantity > 0
                  ? `Add (${cartQuantity})`
                  : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  );
};
