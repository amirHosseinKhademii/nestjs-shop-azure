import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { ORDERS } from '../graphql/queries';
import type { Order, OrderStatus, OrdersQuery } from '../graphql/types';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

const statusToBadge: Record<string, string> = {
  PENDING: 'badge--warn',
  PAID: 'badge--ok',
  FULFILLED: 'badge--ok',
  FAILED: 'badge--danger',
};

const badgeFor = (status: OrderStatus) => statusToBadge[status] ?? 'badge--muted';

export function OrdersPage() {
  const { data, loading, error } = useQuery<OrdersQuery>(ORDERS);

  if (loading) return <Spinner label="Loading orders" />;
  if (error) {
    return (
      <div className="card card--error" role="alert">
        Could not load orders: {error.message}
      </div>
    );
  }

  const orders = data?.orders ?? [];

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Once you check out, your orders will appear here."
        action={
          <Link to="/" className="btn btn--primary">
            Start shopping
          </Link>
        }
      />
    );
  }

  return (
    <section aria-labelledby="orders-heading">
      <header className="page-header">
        <h2 id="orders-heading">Orders</h2>
        <p className="muted">{orders.length} total</p>
      </header>
      <ul className="grid">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </ul>
    </section>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <li className="card">
      <div className="page-header page-header--inline">
        <strong>Order {order.id.slice(0, 8)}…</strong>
        <span className={`badge ${badgeFor(order.status)}`}>{order.status}</span>
      </div>
      <p className="muted small">corr: {order.correlationId}</p>
      <ul className="line-list">
        {order.lines.map((l, idx) => (
          <li key={`${l.productId}-${idx}`} className="line-list__row">
            <span className="line-list__id">Product {l.productId}</span>
            <span className="line-list__qty">× {l.quantity}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}
