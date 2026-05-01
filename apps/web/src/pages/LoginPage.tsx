import { useState, type FormEvent } from 'react';
import { useMutation } from '@apollo/client';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { LOGIN } from '../graphql/mutations';
import type { LoginMutation, LoginVars } from '../graphql/types';
import { useAuth } from '../auth/useAuth';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { loading, error }] = useMutation<LoginMutation, LoginVars>(LOGIN);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const res = await login({ variables: { email, password } });
    const payload = res.data?.login;
    if (payload?.accessToken) {
      signIn(payload.accessToken, payload.user);
      const state = location.state as LocationState | null;
      navigate(state?.from ?? '/', { replace: true });
    }
  };

  return (
    <div className="card card--narrow">
      <h2>Welcome back</h2>
      <p className="muted">Log in to manage your cart and orders.</p>

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
