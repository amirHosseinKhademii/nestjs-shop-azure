import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AUTH_SESSION_EXPIRED_EVENT, type AuthLocationState } from './auth-context';

const PUBLIC_PATHS = new Set<string>(['/login', '/register']);

/**
 * Router-aware companion to AuthProvider. Lives inside `<RouterProvider>` so
 * it can call `useNavigate` — the AuthProvider can't, since it sits above the
 * router. Listens for the `auth:session-expired` event and routes the user
 * to /login with enough state for the page to render a friendly banner.
 *
 * Renders nothing.
 */
export function SessionGuard() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onExpired = () => {
      // Already on an auth page → leave the user where they are; the banner
      // logic on /login handles the messaging on its own next mount.
      if (PUBLIC_PATHS.has(location.pathname)) return;
      const state: AuthLocationState = {
        reason: 'expired',
        from: location.pathname + location.search,
      };
      navigate('/login', { replace: true, state });
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
  }, [navigate, location.pathname, location.search]);

  return null;
}
