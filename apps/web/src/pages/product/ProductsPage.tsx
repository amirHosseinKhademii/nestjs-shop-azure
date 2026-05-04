import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { Link } from 'react-router-dom';
import { PRODUCTS } from '../../graphql/queries';
import { ADD_TO_CART } from '../../graphql/mutations';
import type { ProductsQuery } from '../../__generated__/graphql';
import { useAuth } from '../../auth/useAuth';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { AddProduct } from './containers/add-product/AddProduct';

// Single-product shape is derived from the generated query type so it always
// matches what the resolver actually returns for this selection set.
type Product = ProductsQuery['products'][number];

const formatPrice = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);

export function ProductsPage() {
  const { isAuthenticated } = useAuth();
  const { data, loading, error } = useQuery(PRODUCTS);
  const [addToCart, { loading: adding }] = useMutation(ADD_TO_CART);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const onAdd = async (productId: string) => {
    setPendingId(productId);
    try {
      await addToCart({ variables: { productId, qty: 1 } });
      setToast('Added to cart');
    } finally {
      setPendingId(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  if (loading) return <Spinner label="Loading products" />;
  if (error) {
    return (
      <div className="card card--error" role="alert">
        Could not load products: {error.message}
      </div>
    );
  }

  const products = data?.products ?? [];

  return (
    <section aria-labelledby="products-heading">
      <header className="page-header">
        <div>
          <h2 id="products-heading">Products</h2>
          <p className="muted">
            {products.length} item{products.length === 1 ? '' : 's'} in catalog
          </p>
        </div>
        <AddProduct />
      </header>

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add your first product to get the catalog started."
          action={<AddProduct triggerLabel="Add your first product" />}
        />
      ) : (
        <ul className="grid">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isAuthenticated={isAuthenticated}
              isAdding={adding && pendingId === p.id}
              onAdd={() => onAdd(p.id)}
            />
          ))}
        </ul>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </section>
  );
}

interface ProductCardProps {
  product: Product;
  isAuthenticated: boolean;
  isAdding: boolean;
  onAdd: () => void;
}

function ProductCard({ product, isAuthenticated, isAdding, onAdd }: ProductCardProps) {
  const inStock = product.stock > 0;
  return (
    <li className="card product">
      <div className="product__head">
        <h3 className="product__name">{product.name}</h3>
        <span className={`badge ${inStock ? 'badge--ok' : 'badge--muted'}`}>
          {inStock ? `${product.stock} in stock` : 'Out of stock'}
        </span>
      </div>
      <div className="product__price">{formatPrice(product.priceCents)}</div>
      {product.description && <p className="muted">{product.description}</p>}
      {isAuthenticated ? (
        <button
          type="button"
          className="btn btn--primary"
          onClick={onAdd}
          disabled={!inStock || isAdding}
        >
          {isAdding ? 'Adding…' : 'Add to cart'}
        </button>
      ) : (
        <Link to="/login" className="btn btn--ghost">
          Sign in to buy
        </Link>
      )}
    </li>
  );
}
