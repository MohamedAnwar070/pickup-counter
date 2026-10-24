import React from 'react';
import { Link } from 'react-router-dom';
import { useShop } from '../state/ShopContext';
import { formatHoldDuration } from '../common';

export const HowItWorksPage: React.FC = () => {
  const { holdSeconds } = useShop();
  const holdLabel = formatHoldDuration(holdSeconds);

  return (
    <div className="info-page">
      <div className="info-header">
        <div>
          <span className="section-eyebrow">System Guide</span>
          <h1>How Pickup Counter Works</h1>
          <p>
            Stock reservations, payment verification, and locker collection rules.
          </p>
        </div>
        <div className="info-header-actions">
          <Link to="/" className="btn btn-primary btn-sm">
            Browse Catalog
          </Link>
          <Link to="/orders" className="btn btn-secondary btn-sm">
            My Orders
          </Link>
        </div>
      </div>

      <section className="info-section">
        <div className="info-steps">
          <div className="info-step">
            <span>01</span>
            <h3>Select Items</h3>
            <p>
              Available units equal physical stock minus active holds and paid uncollected orders.
            </p>
          </div>
          <div className="info-step">
            <span>02</span>
            <h3>Reserve ({holdLabel} Hold)</h3>
            <p>
              Placing an order locks product rows in ascending ID order inside a database transaction and starts a {holdLabel} timer.
            </p>
          </div>
          <div className="info-step">
            <span>03</span>
            <h3>Complete Payment</h3>
            <p>
              Payments are verified via HMAC-SHA256 webhooks with database-enforced idempotency on event IDs.
            </p>
          </div>
          <div className="info-step">
            <span>04</span>
            <h3>Claim from Locker</h3>
            <p>
              Opening the assigned locker bay transitions the order to picked up and permanently decrements stock once.
            </p>
          </div>
        </div>
      </section>

      <section className="info-section">
        <h2 className="info-subheading">Edge Cases & Concurrency Rules</h2>
        <div className="info-faq">
          <details open>
            <summary>Multiple buyers racing for the last units</summary>
            <p>
              Orders lock product rows using SELECT ... FOR UPDATE ORDER BY id ASC. If stock is insufficient for any line item, the entire transaction rolls back and returns 409 INSUFFICIENT_STOCK with itemised shortage details.
            </p>
          </details>
          <details>
            <summary>Cancelling an active hold</summary>
            <p>
              Pending reservations can be cancelled at any time before payment or expiry. Cancellation immediately releases the held units back to the catalog.
            </p>
          </details>
          <details>
            <summary>Late payments arriving after the timer ends</summary>
            <p>
              When a valid payment arrives after expiry, the server locks the product rows and checks live availability. If stock is still available, the order is accepted as paid_late. If another buyer claimed the stock, the order is marked needs_review with refund_flag set to true.
            </p>
          </details>
          <details>
            <summary>Device clock drift protection</summary>
            <p>
              The backend uses PostgreSQL clock_timestamp() for all expiry checks. The frontend countdown uses monotonic performance.now() relative to server-computed expiresInSeconds, so an inaccurate phone or laptop clock never affects the timer.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
};
