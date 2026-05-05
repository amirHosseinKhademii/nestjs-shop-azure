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

export const TASKS = graphql(`
  query Tasks(
    $page: Int
    $pageSize: Int
    $status: TaskStatus
    $priority: TaskPriority
    $q: String
  ) {
    tasks(page: $page, pageSize: $pageSize, status: $status, priority: $priority, q: $q) {
      items {
        id
        title
        description
        status
        priority
        dueDate
        createdAt
        updatedAt
      }
      page
      pageSize
      totalItems
      totalPages
    }
  }
`);

export const TASK = graphql(`
  query Task($id: String!) {
    task(id: $id) {
      id
      title
      description
      status
      priority
      dueDate
      createdAt
      updatedAt
    }
  }
`);
