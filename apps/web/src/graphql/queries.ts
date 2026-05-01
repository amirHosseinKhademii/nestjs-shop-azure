import { gql } from '@apollo/client';

export const PRODUCTS = gql`
  query Products {
    products {
      id
      name
      description
      priceCents
      stock
    }
  }
`;

export const CART = gql`
  query Cart {
    cart {
      items {
        productId
        qty
      }
    }
  }
`;

export const ORDERS = gql`
  query Orders {
    orders {
      id
      correlationId
      status
      lines {
        productId
        quantity
      }
    }
  }
`;
