import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApolloClient, ApolloProvider, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { getStoredToken } from './auth/auth-context';
import './styles.css';

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL ?? '/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = getStoredToken();
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
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

createRoot(rootEl).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>,
);
