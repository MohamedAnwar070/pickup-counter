import React from 'react';
import { Link } from 'react-router-dom';
import { useShop } from '../state/ShopContext';
import { formatHoldDuration } from '../common';

export const HowItWorksPage: React.FC = () => {
  const { holdSeconds } = useShop();
  const holdLabel = formatHoldDuration(holdSeconds);
  return (
    <div className="info-page">
      <section className="info-hero">
        <span className="section-eyebrow">The pickup counter promise</span>
        <h1>Reserved means reserved.</h1>
        <p>
          Pickup Counter is built around one simple idea: when you reserve something, another
          shopper should not be able to buy it out from under you. Here is how that works in
          practice.
        </p>
        <div className="info-hero-actions">
          <Link to="/" className="btn btn-primary">
            Shop the counter
          </Link>
          <Link to="/orders" className="btn btn-secondary">
            My reservations
          </Link>
        </div>
      </section>

      <section className="info-section">
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">From shelf to locker</span>
            <h2 className="section-heading">Four calm steps</h2>
          </div>
        </div>
        <div className="info-steps">
          <div className="info-step">
            <span>01</span>
            <h3>Build your basket</h3>
            <p>
              Availability is live. If someone else is holding the last units, the card tells
              you before you click.
            </p>
          </div>
          <div className="info-step">
            <span>02</span>
            <h3>Place your reservation</h3>
            <p>
              The counter checks the stock again inside one database transaction and gives you
              a {holdLabel} exclusive hold. If another shopper won the race, we adjust your
              basket and show you exactly what changed.
            </p>
          </div>
          <div className="info-step">
            <span>03</span>
            <h3>Pay while the timer runs</h3>
            <p>
              Your payment outcome comes from the server, never the browser. If the hold ends
              before payment is confirmed, the stock releases automatically. If a payment
              lands late, the counter checks availability and never oversells.
            </p>
          </div>
          <div className="info-step">
            <span>04</span>
            <h3>Collect from your locker</h3>
            <p>
              A bay and pickup code are assigned to each order. The locker claim is atomic:
              two simultaneous opens still produce one winner and one stock decrement.
            </p>
          </div>
        </div>
      </section>

      <section className="info-section">
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">Honest details</span>
            <h2 className="section-heading">What happens when things go sideways</h2>
          </div>
        </div>
        <div className="info-faq">
          <details open>
            <summary>Someone took the last unit while I was checking out</summary>
            <p>
              The order is not created. Your basket is updated to the latest available
              quantities and each affected item is explained. No partial order is left behind.
            </p>
          </details>
          <details>
            <summary>Can I cancel a reservation?</summary>
            <p>
              Yes — while it is still pending and unpaid. Cancelling immediately releases the
              hold. Once a payment is confirmed, cancellation is no longer possible; the order
              is ready for pickup instead.
            </p>
          </details>
          <details>
            <summary>What if my payment arrives after the timer?</summary>
            <p>
              The server never trusts the browser timer. If the payment provider confirms a
              late payment and every item is still available, the order is accepted. Otherwise
              it goes to a counter review with a refund flag; it is never marked paid for stock
              that is gone.
            </p>
          </details>
          <details>
            <summary>Is this a live payment gateway?</summary>
            <p>
              No. This build uses a clearly labelled sandbox checkout so the full flow can be
              reviewed end-to-end. The server has a gated demo payment route and also supports
              real HMAC-signed provider webhooks. No webhook secret is exposed to the browser,
              and no card details are collected.
            </p>
          </details>
          <details>
            <summary>Where are my orders stored?</summary>
            <p>
              In this browser, so you can close the tab and resume. The order itself lives on
              the server. You can always reopen it from My reservations; the page re-checks its
              live status.
            </p>
          </details>
        </div>
      </section>

      <section className="info-cta">
        <div>
          <span className="section-eyebrow">The shelf is waiting</span>
          <h2>Find something worth holding.</h2>
          <p>Five small-batch favourites, reserved one shopper at a time.</p>
        </div>
        <Link to="/" className="btn btn-primary">
          Browse the counter
        </Link>
      </section>
    </div>
  );
};
