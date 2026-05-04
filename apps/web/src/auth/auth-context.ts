import { createContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthRedirectReason = 'required' | 'expired';

export interface AuthLocationState {
  /** Pathname the user was on when redirected to /login. */
  from?: string;
  /** Why the redirect happened, drives the banner copy on /login. */
  reason?: AuthRedirectReason;
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

/**
 * Window event dispatched whenever the client decides the current session is
 * no longer trustworthy. Listeners (the AuthProvider, the router-aware
 * SessionGuard) react by signing out and surfacing a UI banner.
 *
 * Sources that can emit it:
 *   - AuthProvider's expiry timer firing while the user is idle.
 *   - The Apollo auth link noticing a stored-but-expired token.
 *   - The Apollo error link receiving an UNAUTHENTICATED / 401 response.
 */
export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

/**
 * Decode a JWT payload without verifying the signature. The signature is the
 * gateway's responsibility — this is purely so the client can pre-empt
 * obviously-stale tokens (avoids a round-trip just to learn we're logged out).
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload] = parts;
  if (!payload) return null;
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    const json =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Returns the JWT `exp` claim (seconds since epoch) or null if undecodable. */
export function getTokenExpirySec(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const exp = (payload as { exp?: unknown }).exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
}

/**
 * `true` only when we can decode the token AND its `exp` is in the past.
 * Opaque/non-JWT tokens always return `false` — we let the gateway decide,
 * which keeps the existing test fixtures (`'fake-jwt'`) working unchanged.
 */
export function isTokenExpired(
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const exp = getTokenExpirySec(token);
  if (exp === null) return false;
  return nowSec >= exp;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return null;
    if (isTokenExpired(token)) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function dispatchSessionExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
}
