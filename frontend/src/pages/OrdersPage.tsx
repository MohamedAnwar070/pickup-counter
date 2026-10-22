import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRupees, OrderStatus } from '@pickup-counter/shared';
import { useOrders, SavedOrder } from '../state/OrdersContext';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Ready for pickup',
  expired: 'Hold expired',
  needs_review: 'Needs review',
  picked_up: 'Collected',
  cancelled: 'Cancelled',
};

const statusHelp: Record<OrderStatus, string> = {
  pending: 'Your hold may still be active. Open the order to see the live timer.',
  paid: 'Your locker is ready at the MetroSober counter.',
  expired: 'The hold ended without payment. Nothing was charged.',
  needs_review: 'The counter team is checking this payment. Do not pay again.',
  picked_up: 'Collected from the locker. Your receipt is available in the order.',
  cancelled: 'This reservation was cancelled and the stock was released.',
};

const isActive = (status: OrderStatus) =>
  status === 'pending' || status === 'paid' || status === 'needs_review';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

type Filter = 'all' | 'active' | 'complete';

export const OrdersPage: React.FC = () => {
  const { orders, refreshSavedOrders } = useOrders();
  const [filter, setFilter] = useState<Filter>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (filter === 'active') return isActive(order.status);
        if (filter === 'complete') return !isActive(order.status);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [filter, orders]);

  const refresh = async () => {
    setIsRefreshing(true);
    await refreshSavedOrders().finally(() => setIsRefreshing(false));
  };

  return (
    <div className="orders-page">
      <div className="orders-heading">
        <div>
          <span className="section-eyebrow">Saved on this device</span>
          <h1>My reservations</h1>
          <p>
            Pick up where you left off. Your order stays here even if you close the tab or
            lose the payment screen.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? 'Checking counter…' : 'Refresh statuses'}
        </button>
      </div>

      <div className="orders-filter-row">
        <div className="orders-filters" role="tablist" aria-label="Filter reservations">
          {(
            [
              ['all', 'All'],
              ['active', 'In progress'],
              ['complete', 'Completed'],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={`orders-filter ${filter === value ? 'is-active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="orders-count">
          {orders.length} saved {orders.length === 1 ? 'reservation' : 'reservations'}
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="empty-catalog-state page-empty-state">
          <div className="empty-icon">🧾</div>
          <h2>No reservations yet</h2>
          <p>
            Start an order at the counter. Once you reserve, it will appear here so you can
            always find it again.
          </p>
          <Link to="/" className="btn btn-primary">
            Browse the counter
          </Link>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-catalog-state page-empty-state">
          <h2>Nothing in this view</h2>
          <p>Try another filter to see your other reservations.</p>
          <button className="btn btn-secondary" onClick={() => setFilter('all')}>
            Show all reservations
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}

      <div className="orders-footnote">
        <span>🔒</span>
        <p>
          Reservation history is stored in this browser for privacy. Opening an order checks
          its live status with the counter. On another device, use the order link.
        </p>
      </div>
    </div>
  );
};

const OrderRow: React.FC<{ order: SavedOrder }> = ({ order }) => {
  const active = isActive(order.status);
  const actionLabel =
    order.status === 'pending'
      ? 'Resume payment'
      : order.status === 'paid'
        ? 'View locker'
        : 'Open order';

  return (
    <article className={`order-row status-${order.status}`}>
      <div className="order-row-marker" aria-hidden="true">
        {order.status === 'paid' ? '🔐' : order.status === 'picked_up' ? '✓' : '◷'}
      </div>
      <div className="order-row-main">
        <div className="order-row-topline">
          <span className={`order-status-badge status-${order.status}`}>
            <span className="status-badge-dot"></span>
            {statusLabels[order.status]}
          </span>
          <span className="order-row-date">{formatDate(order.createdAt)}</span>
        </div>
        <h2>Order #{order.id.slice(0, 8).toUpperCase()}</h2>
        <p>{statusHelp[order.status]}</p>
        <div className="order-row-meta">
          <span>{formatRupees(order.totalPaise)}</span>
          {order.lockerNumber && (
            <span>Locker bay {String(order.lockerNumber).padStart(2, '0')}</span>
          )}
          {order.status === 'pending' && <span>Hold timer live</span>}
        </div>
      </div>
      <div className="order-row-action">
        <Link
          to={`/order/${order.id}`}
          className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
};
