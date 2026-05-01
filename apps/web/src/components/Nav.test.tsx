import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Nav } from './Nav';
import { renderWithProviders } from '../test/renderApp';

describe('<Nav />', () => {
  it('shows login + sign up when no token is present', () => {
    renderWithProviders(<Nav />);
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('shows logout when a token is present', () => {
    window.localStorage.setItem('token', 'fake-jwt');
    renderWithProviders(<Nav />);
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('renders the three primary destinations', () => {
    renderWithProviders(<Nav />);
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
  });
});
