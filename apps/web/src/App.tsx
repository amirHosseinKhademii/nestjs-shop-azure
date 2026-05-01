import { Navigate, Route, Routes } from 'react-router-dom';
import { Suspense } from 'react';
import { Nav } from './components/Nav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Spinner } from './components/Spinner';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProductsPage } from './pages/ProductsPage';
import { CartPage } from './pages/CartPage';
import { OrdersPage } from './pages/OrdersPage';

export function App() {
  return (
    <div className="app">
      <Nav />
      <main className="container" id="main">
        <ErrorBoundary>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<ProductsPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/cart"
                element={
                  <RequireAuth>
                    <CartPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/orders"
                element={
                  <RequireAuth>
                    <OrdersPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        <span className="muted small">Shop Nest Azure · Demo storefront</span>
      </footer>
    </div>
  );
}

export default App;
