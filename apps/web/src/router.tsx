import { createBrowserRouter, Navigate } from 'react-router-dom';
import {
  getInternalFaroFromGlobalObject,
  withFaroRouterInstrumentation,
} from '@grafana/faro-react';
import { RootLayout } from './App';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProductsPage } from './pages/product';
import { CartPage } from './pages/CartPage';
import { OrdersPage } from './pages/OrdersPage';
import { TasksPage } from './pages/TasksPage';

export function createAppRouter() {
  const router = createBrowserRouter([
    {
      path: '/',
      element: <RootLayout />,
      children: [
        { index: true, element: <ProductsPage /> },
        { path: 'login', element: <LoginPage /> },
        { path: 'register', element: <RegisterPage /> },
        {
          path: 'cart',
          element: (
            <RequireAuth>
              <CartPage />
            </RequireAuth>
          ),
        },
        {
          path: 'orders',
          element: (
            <RequireAuth>
              <OrdersPage />
            </RequireAuth>
          ),
        },
        {
          path: 'tasks',
          element: (
            <RequireAuth>
              <TasksPage />
            </RequireAuth>
          ),
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ]);

  return getInternalFaroFromGlobalObject() ? withFaroRouterInstrumentation(router) : router;
}
