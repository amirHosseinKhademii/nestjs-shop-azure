/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  '\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n': typeof types.LoginDocument;
  '\n  mutation Register($email: String!, $password: String!, $displayName: String) {\n    register(email: $email, password: $password, displayName: $displayName) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n': typeof types.RegisterDocument;
  '\n  mutation AddToCart($productId: String!, $qty: Int!) {\n    addToCart(productId: $productId, qty: $qty) {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n': typeof types.AddToCartDocument;
  '\n  mutation Checkout {\n    checkout {\n      accepted\n      correlationId\n      cartId\n      channel\n    }\n  }\n': typeof types.CheckoutDocument;
  '\n  mutation CreateProduct($name: String!, $priceCents: Int!, $description: String, $stock: Int) {\n    createProduct(name: $name, priceCents: $priceCents, description: $description, stock: $stock) {\n      id\n      name\n      priceCents\n      stock\n    }\n  }\n': typeof types.CreateProductDocument;
  '\n  mutation CreateTask($input: CreateTaskInputGql!) {\n    createTask(input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateTaskDocument;
  '\n  mutation UpdateTask($id: String!, $input: UpdateTaskInputGql!) {\n    updateTask(id: $id, input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateTaskDocument;
  '\n  mutation DeleteTask($id: String!) {\n    deleteTask(id: $id)\n  }\n': typeof types.DeleteTaskDocument;
  '\n  query Products {\n    products {\n      id\n      name\n      description\n      priceCents\n      stock\n    }\n  }\n': typeof types.ProductsDocument;
  '\n  query Cart {\n    cart {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n': typeof types.CartDocument;
  '\n  query Orders {\n    orders {\n      id\n      correlationId\n      status\n      lines {\n        productId\n        quantity\n      }\n    }\n  }\n': typeof types.OrdersDocument;
  '\n  query Tasks(\n    $page: Int\n    $pageSize: Int\n    $status: TaskStatus\n    $priority: TaskPriority\n    $q: String\n  ) {\n    tasks(page: $page, pageSize: $pageSize, status: $status, priority: $priority, q: $q) {\n      items {\n        id\n        title\n        description\n        status\n        priority\n        dueDate\n        createdAt\n        updatedAt\n      }\n      page\n      pageSize\n      totalItems\n      totalPages\n    }\n  }\n': typeof types.TasksDocument;
  '\n  query Task($id: String!) {\n    task(id: $id) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.TaskDocument;
};
const documents: Documents = {
  '\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n':
    types.LoginDocument,
  '\n  mutation Register($email: String!, $password: String!, $displayName: String) {\n    register(email: $email, password: $password, displayName: $displayName) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n':
    types.RegisterDocument,
  '\n  mutation AddToCart($productId: String!, $qty: Int!) {\n    addToCart(productId: $productId, qty: $qty) {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n':
    types.AddToCartDocument,
  '\n  mutation Checkout {\n    checkout {\n      accepted\n      correlationId\n      cartId\n      channel\n    }\n  }\n':
    types.CheckoutDocument,
  '\n  mutation CreateProduct($name: String!, $priceCents: Int!, $description: String, $stock: Int) {\n    createProduct(name: $name, priceCents: $priceCents, description: $description, stock: $stock) {\n      id\n      name\n      priceCents\n      stock\n    }\n  }\n':
    types.CreateProductDocument,
  '\n  mutation CreateTask($input: CreateTaskInputGql!) {\n    createTask(input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateTaskDocument,
  '\n  mutation UpdateTask($id: String!, $input: UpdateTaskInputGql!) {\n    updateTask(id: $id, input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateTaskDocument,
  '\n  mutation DeleteTask($id: String!) {\n    deleteTask(id: $id)\n  }\n':
    types.DeleteTaskDocument,
  '\n  query Products {\n    products {\n      id\n      name\n      description\n      priceCents\n      stock\n    }\n  }\n':
    types.ProductsDocument,
  '\n  query Cart {\n    cart {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n':
    types.CartDocument,
  '\n  query Orders {\n    orders {\n      id\n      correlationId\n      status\n      lines {\n        productId\n        quantity\n      }\n    }\n  }\n':
    types.OrdersDocument,
  '\n  query Tasks(\n    $page: Int\n    $pageSize: Int\n    $status: TaskStatus\n    $priority: TaskPriority\n    $q: String\n  ) {\n    tasks(page: $page, pageSize: $pageSize, status: $status, priority: $priority, q: $q) {\n      items {\n        id\n        title\n        description\n        status\n        priority\n        dueDate\n        createdAt\n        updatedAt\n      }\n      page\n      pageSize\n      totalItems\n      totalPages\n    }\n  }\n':
    types.TasksDocument,
  '\n  query Task($id: String!) {\n    task(id: $id) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.TaskDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Register($email: String!, $password: String!, $displayName: String) {\n    register(email: $email, password: $password, displayName: $displayName) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation Register($email: String!, $password: String!, $displayName: String) {\n    register(email: $email, password: $password, displayName: $displayName) {\n      accessToken\n      user {\n        id\n        email\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AddToCart($productId: String!, $qty: Int!) {\n    addToCart(productId: $productId, qty: $qty) {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AddToCart($productId: String!, $qty: Int!) {\n    addToCart(productId: $productId, qty: $qty) {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Checkout {\n    checkout {\n      accepted\n      correlationId\n      cartId\n      channel\n    }\n  }\n',
): (typeof documents)['\n  mutation Checkout {\n    checkout {\n      accepted\n      correlationId\n      cartId\n      channel\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateProduct($name: String!, $priceCents: Int!, $description: String, $stock: Int) {\n    createProduct(name: $name, priceCents: $priceCents, description: $description, stock: $stock) {\n      id\n      name\n      priceCents\n      stock\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateProduct($name: String!, $priceCents: Int!, $description: String, $stock: Int) {\n    createProduct(name: $name, priceCents: $priceCents, description: $description, stock: $stock) {\n      id\n      name\n      priceCents\n      stock\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateTask($input: CreateTaskInputGql!) {\n    createTask(input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateTask($input: CreateTaskInputGql!) {\n    createTask(input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateTask($id: String!, $input: UpdateTaskInputGql!) {\n    updateTask(id: $id, input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateTask($id: String!, $input: UpdateTaskInputGql!) {\n    updateTask(id: $id, input: $input) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteTask($id: String!) {\n    deleteTask(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteTask($id: String!) {\n    deleteTask(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Products {\n    products {\n      id\n      name\n      description\n      priceCents\n      stock\n    }\n  }\n',
): (typeof documents)['\n  query Products {\n    products {\n      id\n      name\n      description\n      priceCents\n      stock\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Cart {\n    cart {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Cart {\n    cart {\n      items {\n        productId\n        qty\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Orders {\n    orders {\n      id\n      correlationId\n      status\n      lines {\n        productId\n        quantity\n      }\n    }\n  }\n',
): (typeof documents)['\n  query Orders {\n    orders {\n      id\n      correlationId\n      status\n      lines {\n        productId\n        quantity\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Tasks(\n    $page: Int\n    $pageSize: Int\n    $status: TaskStatus\n    $priority: TaskPriority\n    $q: String\n  ) {\n    tasks(page: $page, pageSize: $pageSize, status: $status, priority: $priority, q: $q) {\n      items {\n        id\n        title\n        description\n        status\n        priority\n        dueDate\n        createdAt\n        updatedAt\n      }\n      page\n      pageSize\n      totalItems\n      totalPages\n    }\n  }\n',
): (typeof documents)['\n  query Tasks(\n    $page: Int\n    $pageSize: Int\n    $status: TaskStatus\n    $priority: TaskPriority\n    $q: String\n  ) {\n    tasks(page: $page, pageSize: $pageSize, status: $status, priority: $priority, q: $q) {\n      items {\n        id\n        title\n        description\n        status\n        priority\n        dueDate\n        createdAt\n        updatedAt\n      }\n      page\n      pageSize\n      totalItems\n      totalPages\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Task($id: String!) {\n    task(id: $id) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query Task($id: String!) {\n    task(id: $id) {\n      id\n      title\n      description\n      status\n      priority\n      dueDate\n      createdAt\n      updatedAt\n    }\n  }\n'];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
