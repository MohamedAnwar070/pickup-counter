import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRupees, OrderStatus } from '../common';
import { useOrders, SavedOrder } from '../state/OrdersContext';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Ready for pickup',
  expired: 'Expired',
  needs_review: 'Needs review',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
};

const statusHelp: Record<OrderStatus, string> = {
  pending: 'Hold active. Open order to complete payment.',
  paid: 'Payment verified. Ready for locker collection.',
  expired: 'Hold expired before payment.',
  needs_review: 'Flagged for counter staff review.',
  picked_up: 'Collected from locker.',
  cancelled: 'Cancelled by customer; stock released.',
};

const isActive = (status: OrderStatus) =>
  status === 'pending' || status === 'paid' || status === 'needs_review';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
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
          <span className="section-eyebrow">Browser History</span>
          <h1>My Orders ({orders.length})</h1>
        </div>
        <div className="orders-controls">
          <div className="orders-filters" role="tablist" aria-label="Filter orders">
            {(
              [
                ['all', 'All'],
                ['active', 'Active'],
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
          <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty-catalog-state page-empty-state">
          <h2>No orders yet</h2>
          <p>Reserve items from the catalog to view and manage your orders here.</p>
          <Link to="/" className="btn btn-primary btn-sm">
            Browse Catalog
          </Link>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-catalog-state page-empty-state">
          <h2>No matching orders</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setFilter('all')}>
            Show All Orders
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
};

const OrderRow: React.FC<{ order: SavedOrder }> = ({ order }) => {
  const active = isActive(order.status);
  const actionLabel =
    order.status === 'pending'
      ? 'Pay Now'
      : order.status === 'paid'
        ? 'Open Locker'
        : 'Details';

  return (
    <article className={`order-row status-${order.status}`}>
      <div className="order-row-main">
        <div className="order-row-topline">
          <h2>Order #{order.id.slice(0, 8).toUpperCase()}</h2>
          <span className={`order-status-badge status-${order.status}`}>
            <span className="status-badge-dot"></span>
            {statusLabels[order.status]}
          </span>
          <span className="order-row-date">{formatDate(order.createdAt)}</span>
        </div>
        <p>{statusHelp[order.status]}</p>
        <div className="order-row-meta">
          <span>{formatRupees(order.totalPaise)}</span>
          {order.lockerNumber && (
            <span>Locker Bay {String(order.lockerNumber).padStart(2, '0')}</span>
          )}
        </div>
      </div>
      <div className="order-row-action">
        <Link
          to={`/order/${order.id}`}
          className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
};
