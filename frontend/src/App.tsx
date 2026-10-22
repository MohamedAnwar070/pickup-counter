import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ShopPage } from './pages/ShopPage';
import { ProductPage } from './pages/ProductPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { HowItWorksPage } from './pages/HowItWorksPage';

const NotFoundPage: React.FC = () => (
  <div className="empty-catalog-state page-empty-state">
    <div className="empty-icon">🧭</div>
    <h2>That counter aisle doesn’t exist</h2>
    <p>The page may have moved, or the link may be incomplete.</p>
    <Link to="/" className="btn btn-primary">
      Back to the shop
    </Link>
  </div>
);

export const App: React.FC = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ShopPage />} />
        <Route path="product/:id" element={<ProductPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="order/:id" element={<OrderPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="how-it-works" element={<HowItWorksPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
