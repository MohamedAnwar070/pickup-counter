import React, { useState } from 'react';
import { Product } from '../common';

interface ProductImageProps {
  product: Product;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({ product, className = '' }) => {
  const [failed, setFailed] = useState<boolean>(false);

  if (!product.imageUrl || failed) {
    return (
      <div className={`product-image-fallback ${className}`.trim()} aria-label={product.name}>
        <span>{product.category || 'Counter'}</span>
        <strong>{product.name.slice(0, 1)}</strong>
      </div>
    );
  }

  return (
    <img
      src={product.imageUrl}
      alt={product.name}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};
