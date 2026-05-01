import { useState, type FormEvent } from 'react';
import { useMutation } from '@apollo/client';
import { Link, useNavigate } from 'react-router-dom';
import { REGISTER } from '../graphql/mutations';
import type { RegisterMutation, RegisterVars } from '../graphql/types';
import { useAuth } from '../auth/useAuth';

export function RegisterPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [register, { loading, error }] = useMutation<RegisterMutation, RegisterVars>(REGISTER);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const res = await register({
      variables: { email, password, displayName: displayName || undefined },
    });
    const payload = res.data?.register;
    if (payload?.accessToken) {
      signIn(payload.accessToken, payload.user);
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="card card--narrow">
      <h2>Create your account</h2>
      <p className="muted">Get a cart and order history in seconds.</p>

      <form onSubmit={onSubmit} noValidate aria-busy={loading}>
        <label className="field">
          <span>Display name (optional)</span>
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            aria-describedby="pw-hint"
            aria-invalid={Boolean(error)}
          />
          <small id="pw-hint" className="muted">
            At least 8 characters.
          </small>
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      <p className="muted small">
        Already have one? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
