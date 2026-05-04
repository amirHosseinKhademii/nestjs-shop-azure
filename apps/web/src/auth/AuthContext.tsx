import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApolloClient } from '@apollo/client';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AuthContext,
  TOKEN_STORAGE_KEY,
  dispatchSessionExpired,
  getStoredToken,
  getTokenExpirySec,
  isTokenExpired,
  type AuthContextValue,
  type AuthUser,
} from './auth-context';

// Setting setTimeout with a delay > 2^31-1 ms (~24.8 days) overflows to a
// negative value and fires immediately — clamp to be safe for very long-lived
// dev tokens.
const MAX_TIMEOUT_MS = 2_147_483_647;

export function AuthProvider({ children }: { children: ReactNode }) {
  const apollo = useApolloClient();
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);

  const signIn = useCallback((nextToken: string, nextUser?: AuthUser | null) => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    if (nextUser) setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    void apollo.clearStore();
  }, [apollo]);

  // Cross-tab sync: a sign-in/out in another tab updates this one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_STORAGE_KEY) return;
      const next = e.newValue;
      if (next && isTokenExpired(next)) return;
      setToken(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Pre-emptive expiry: schedule a single timer at the JWT's `exp` so we sign
  // out the moment the session goes stale, even while the user is idle.
  useEffect(() => {
    if (!token) return undefined;
    const expSec = getTokenExpirySec(token);
    if (expSec === null) return undefined;
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, expSec * 1000 - Date.now()));
    const handle = window.setTimeout(() => {
      dispatchSessionExpired();
    }, delay);
    return () => window.clearTimeout(handle);
  }, [token]);

  // Single funnel for "session is over": Apollo errors, the timer above, and
  // a stale-token check on next page load all dispatch the same event.
  useEffect(() => {
    const onExpired = () => signOut();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      signIn,
      signOut,
    }),
    [token, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
