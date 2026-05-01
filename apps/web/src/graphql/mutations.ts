import { gql } from '@apollo/client';

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      user {
        id
        email
      }
    }
  }
`;

export const REGISTER = gql`
  mutation Register($email: String!, $password: String!, $displayName: String) {
    register(email: $email, password: $password, displayName: $displayName) {
      accessToken
      user {
        id
        email
      }
    }
  }
`;

export const ADD_TO_CART = gql`
  mutation AddToCart($productId: String!, $qty: Int!) {
    addToCart(productId: $productId, qty: $qty) {
      items {
        productId
        qty
      }
    }
  }
`;

export const CHECKOUT = gql`
  mutation Checkout {
    checkout {
      accepted
      correlationId
      cartId
      channel
    }
  }
`;

export const CREATE_PRODUCT = gql`
  mutation CreateProduct($name: String!, $priceCents: Int!, $description: String, $stock: Int) {
    createProduct(name: $name, priceCents: $priceCents, description: $description, stock: $stock) {
      id
      name
      priceCents
      stock
    }
  }
`;
