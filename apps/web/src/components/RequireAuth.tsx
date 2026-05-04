import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import type { AuthLocationState } from '../auth/auth-context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const state: AuthLocationState = {
      reason: 'required',
      from: location.pathname + location.search,
    };
    return <Navigate to="/login" state={state} replace />;
  }
  return <>{children}</>;
}
