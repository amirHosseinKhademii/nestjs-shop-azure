import { graphql } from '../__generated__/gql';

export const PRODUCTS = graphql(`
  query Products {
    products {
      id
      name
      description
      priceCents
      stock
    }
  }
`);

export const CART = graphql(`
  query Cart {
    cart {
      items {
        productId
        qty
      }
    }
  }
`);

export const ORDERS = graphql(`
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
`);
