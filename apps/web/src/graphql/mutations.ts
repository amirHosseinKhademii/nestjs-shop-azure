import { graphql } from '../__generated__/gql';

export const LOGIN = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      user {
        id
        email
      }
    }
  }
`);

export const REGISTER = graphql(`
  mutation Register($email: String!, $password: String!, $displayName: String) {
    register(email: $email, password: $password, displayName: $displayName) {
      accessToken
      user {
        id
        email
      }
    }
  }
`);

export const ADD_TO_CART = graphql(`
  mutation AddToCart($productId: String!, $qty: Int!) {
    addToCart(productId: $productId, qty: $qty) {
      items {
        productId
        qty
      }
    }
  }
`);

export const CHECKOUT = graphql(`
  mutation Checkout {
    checkout {
      accepted
      correlationId
      cartId
      channel
    }
  }
`);

export const CREATE_PRODUCT = graphql(`
  mutation CreateProduct($name: String!, $priceCents: Int!, $description: String, $stock: Int) {
    createProduct(name: $name, priceCents: $priceCents, description: $description, stock: $stock) {
      id
      name
      priceCents
      stock
    }
  }
`);

export const CREATE_TASK = graphql(`
  mutation CreateTask($input: CreateTaskInputGql!) {
    createTask(input: $input) {
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

export const UPDATE_TASK = graphql(`
  mutation UpdateTask($id: String!, $input: UpdateTaskInputGql!) {
    updateTask(id: $id, input: $input) {
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

export const DELETE_TASK = graphql(`
  mutation DeleteTask($id: String!) {
    deleteTask(id: $id)
  }
`);
