import { afterEach, describe, expect, it } from 'vitest';
import {
  TOKEN_STORAGE_KEY,
  getStoredToken,
  getTokenExpirySec,
  isTokenExpired,
} from './auth-context';

/** Build a minimal unsigned JWT with the given payload. Signature is junk — */
/** the client only ever decodes, never verifies. */
function jwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.sig`;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('JWT expiry helpers', () => {
  it('decodes the exp claim from a well-formed JWT', () => {
    const exp = 1_900_000_000;
    expect(getTokenExpirySec(jwt({ sub: 'u1', exp }))).toBe(exp);
  });

  it('returns null for opaque / non-JWT tokens', () => {
    expect(getTokenExpirySec('fake-jwt')).toBeNull();
    expect(getTokenExpirySec('not.even.close.to.jwt')).toBeNull();
  });

  it('treats opaque tokens as not-expired so the gateway stays the source of truth', () => {
    expect(isTokenExpired('fake-jwt')).toBe(false);
  });

  it('flags JWTs whose exp is in the past', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(isTokenExpired(jwt({ sub: 'u1', exp: past }))).toBe(true);
  });

  it('does not flag JWTs whose exp is comfortably in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenExpired(jwt({ sub: 'u1', exp: future }))).toBe(false);
  });
});

describe('getStoredToken', () => {
  it('returns the stored token when it is fresh', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = jwt({ sub: 'u1', exp: future });
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    expect(getStoredToken()).toBe(token);
  });

  it('cleans up an expired token and returns null', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jwt({ sub: 'u1', exp: past }));
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('preserves opaque tokens (e.g. test fixtures)', () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'fake-jwt');
    expect(getStoredToken()).toBe('fake-jwt');
  });
});
