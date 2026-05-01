import { createContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (token: string, user?: AuthUser | null) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const TOKEN_STORAGE_KEY = 'token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
