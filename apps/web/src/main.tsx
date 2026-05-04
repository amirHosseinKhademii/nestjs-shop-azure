import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ApolloClient, ApolloProvider, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { FaroErrorBoundary } from '@grafana/faro-react';
import { AuthProvider } from './auth/AuthContext';
import { dispatchSessionExpired, getStoredToken } from './auth/auth-context';
import { bootstrapObservability } from './observability';
import { createAppRouter } from './router';
import './styles.css';

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL ?? '/graphql',
});

const authLink = setContext((_, { headers }) => {
  // `getStoredToken` returns null for expired JWTs (and cleans them up). We
  // also fire the expired event so the UI can react in the same tick rather
  // than waiting for the gateway round-trip to fail.
  const token = getStoredToken();
  if (!token && window.localStorage.getItem('token')) {
    dispatchSessionExpired();
  }
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  // Treat any UNAUTHENTICATED-shaped response as a session-expired signal.
  // The gateway uses `@nestjs/passport`'s default which surfaces both as a
  // GraphQL error with `extensions.code === 'UNAUTHENTICATED'` and (for
  // network-level rejections) a 401 status code.
  const isUnauthenticated =
    graphQLErrors?.some((err) => {
      const code = err.extensions?.code;
      const status = err.extensions?.statusCode;
      return code === 'UNAUTHENTICATED' || status === 401 || /unauthor/i.test(err.message ?? '');
    }) ||
    (networkError &&
      'statusCode' in networkError &&
      (networkError as { statusCode?: number }).statusCode === 401);

  if (isUnauthenticated) {
    dispatchSessionExpired();
  }

  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      console.warn(`[GraphQL] ${err.message}`, err.path);
    }
  }
  if (networkError) console.warn('[Network]', networkError);
});

const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
  connectToDevTools: import.meta.env.DEV,
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

void (async () => {
  await bootstrapObservability();
  const router = createAppRouter();

  createRoot(rootEl).render(
    <StrictMode>
      <ApolloProvider client={client}>
        <FaroErrorBoundary>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </FaroErrorBoundary>
      </ApolloProvider>
    </StrictMode>,
  );
})();
