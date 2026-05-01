import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { RequireAuth } from './RequireAuth';
import { renderWithProviders } from '../test/renderApp';

function Protected() {
  return <p>secret</p>;
}
function LoginStub() {
  return <p>please log in</p>;
}

const renderRoutes = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route
        path="/cart"
        element={
          <RequireAuth>
            <Protected />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<LoginStub />} />
    </Routes>,
    { route },
  );

describe('<RequireAuth />', () => {
  it('redirects to /login when unauthenticated', () => {
    renderRoutes('/cart');
    expect(screen.getByText(/please log in/i)).toBeInTheDocument();
  });

  it('renders children when a token is present', () => {
    window.localStorage.setItem('token', 'fake-jwt');
    renderRoutes('/cart');
    expect(screen.getByText(/secret/i)).toBeInTheDocument();
  });
});
