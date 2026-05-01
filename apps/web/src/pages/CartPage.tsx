import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { Link } from 'react-router-dom';
import { CART } from '../graphql/queries';
import { CHECKOUT } from '../graphql/mutations';
import type { CartQuery, CheckoutMutation } from '../graphql/types';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

export function CartPage() {
  const { data, loading, error } = useQuery<CartQuery>(CART);
  const [checkout, { data: checkoutData, loading: checkingOut, error: checkoutError }] =
    useMutation<CheckoutMutation>(CHECKOUT);
  const [showReceipt, setShowReceipt] = useState(false);

  const onCheckout = async () => {
    await checkout();
    setShowReceipt(true);
  };

  if (loading) return <Spinner label="Loading cart" />;
  if (error) {
    return (
      <div className="card card--error" role="alert">
        Could not load cart: {error.message}
      </div>
    );
  }

  const items = data?.cart?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add some products and they'll show up here."
        action={
          <Link to="/" className="btn btn--primary">
            Browse products
          </Link>
        }
      />
    );
  }

  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <section aria-labelledby="cart-heading" className="card">
      <header className="page-header page-header--inline">
        <h2 id="cart-heading">Your cart</h2>
        <span className="badge badge--muted">
          {totalQty} item{totalQty === 1 ? '' : 's'}
        </span>
      </header>

      <ul className="line-list">
        {items.map((i) => (
          <li key={i.productId} className="line-list__row">
            <span className="line-list__id">Product {i.productId}</span>
            <span className="line-list__qty">× {i.qty}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={onCheckout}
        disabled={checkingOut}
      >
        {checkingOut ? 'Submitting…' : 'Checkout'}
      </button>

      {checkoutError && (
        <p className="error" role="alert">
          {checkoutError.message}
        </p>
      )}

      {showReceipt && checkoutData?.checkout && (
        <div className="receipt" role="status">
          <h3>Order accepted</h3>
          <dl>
            <dt>Correlation</dt>
            <dd>
              <code>{checkoutData.checkout.correlationId}</code>
            </dd>
            <dt>Channel</dt>
            <dd>{checkoutData.checkout.channel}</dd>
          </dl>
          <Link to="/orders" className="btn btn--ghost">
            View orders →
          </Link>
        </div>
      )}
    </section>
  );
}
