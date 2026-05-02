import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Nav } from './components/Nav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Spinner } from './components/Spinner';

/** Shell for React Router data API (`RouterProvider` + nested routes). */
export function RootLayout() {
  return (
    <div className="app">
      <Nav />
      <main className="container" id="main">
        <ErrorBoundary>
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        <span className="muted small">Shop Nest Aws · Demo storefront</span>
      </footer>
    </div>
  );
}
