import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider, type MockedResponse } from '@apollo/client/testing';
import { AuthProvider } from '../auth/AuthContext';

interface Options {
  route?: string;
  mocks?: ReadonlyArray<MockedResponse>;
}

export function renderWithProviders(ui: ReactElement, { route = '/', mocks = [] }: Options = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </MockedProvider>
  );
  return render(ui, { wrapper });
}
