import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { Link } from 'react-router-dom';
import { PRODUCTS } from '../graphql/queries';
import { ADD_TO_CART, CREATE_PRODUCT } from '../graphql/mutations';
import type {
  AddToCartMutation,
  AddToCartVars,
  CreateProductMutation,
  CreateProductVars,
  Product,
  ProductsQuery,
} from '../graphql/types';
import { useAuth } from '../auth/useAuth';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

const formatPrice = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);

export function ProductsPage() {
  const { isAuthenticated } = useAuth();
  const { data, loading, error, refetch } = useQuery<ProductsQuery>(PRODUCTS);
  const [addToCart, { loading: adding }] = useMutation<AddToCartMutation, AddToCartVars>(
    ADD_TO_CART,
  );
  const [createProduct, { loading: seeding }] = useMutation<
    CreateProductMutation,
    CreateProductVars
  >(CREATE_PRODUCT);
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

  const onSeed = async () => {
    await createProduct({
      variables: {
        name: 'Demo product',
        priceCents: 999,
        description: 'Created from UI',
        stock: 10,
      },
    });
    await refetch();
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
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onSeed}
          disabled={seeding}
          title="Insert a sample product"
        >
          {seeding ? 'Adding…' : '+ Demo product'}
        </button>
      </header>

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Seed the catalog to get started."
          action={
            <button type="button" className="btn btn--primary" onClick={onSeed} disabled={seeding}>
              Create demo product
            </button>
          }
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
