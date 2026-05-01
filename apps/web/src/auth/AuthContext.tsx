import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApolloClient } from '@apollo/client';
import {
  AuthContext,
  TOKEN_STORAGE_KEY,
  getStoredToken,
  type AuthContextValue,
  type AuthUser,
} from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const apollo = useApolloClient();
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) setToken(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
