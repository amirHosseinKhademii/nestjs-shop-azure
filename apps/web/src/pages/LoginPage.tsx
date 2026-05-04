import { useState, type FormEvent } from 'react';
import { useMutation } from '@apollo/client';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { LOGIN } from '../graphql/mutations';
import { useAuth } from '../auth/useAuth';
import type { AuthLocationState } from '../auth/auth-context';

const FRIENDLY_DESTINATIONS: Record<string, string> = {
  '/cart': 'your cart',
  '/orders': 'your orders',
};

function describeDestination(from: string | undefined): string | null {
  if (!from) return null;
  const path = from.split('?')[0] ?? from;
  return FRIENDLY_DESTINATIONS[path] ?? path;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { loading, error }] = useMutation(LOGIN);

  const state = location.state as AuthLocationState | null;
  const reason = state?.reason;
  const destination = describeDestination(state?.from);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const res = await login({ variables: { email, password } });
    const payload = res.data?.login;
    if (payload?.accessToken) {
      signIn(payload.accessToken, payload.user);
      navigate(state?.from ?? '/', { replace: true });
    }
  };

  return (
    <div className="card card--narrow">
      <h2>Welcome back</h2>
      <p className="muted">Log in to manage your cart and orders.</p>

      {reason === 'expired' && (
        <div className="banner banner--warn" role="alert">
          <strong>Your session expired.</strong> Sign in again to pick up where you left off
          {destination ? ` on ${destination}` : ''}.
        </div>
      )}
      {reason === 'required' && (
        <div className="banner banner--info" role="status">
          You need to be signed in to access {destination ?? 'this page'}.
        </div>
      )}

      <form onSubmit={onSubmit} noValidate aria-busy={loading}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={Boolean(error)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            aria-invalid={Boolean(error)}
          />
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      <p className="muted small">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
