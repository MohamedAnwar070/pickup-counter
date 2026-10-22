import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { OrdersProvider } from './state/OrdersContext';
import { ShopProvider } from './state/ShopContext';
import './index.css';
import './app.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <OrdersProvider>
        <ShopProvider>
          <App />
        </ShopProvider>
      </OrdersProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
