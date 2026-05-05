/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type AuthPayloadGql = {
  __typename?: 'AuthPayloadGql';
  accessToken: Scalars['String']['output'];
  expiresIn: Scalars['String']['output'];
  user: UserGql;
};

export type CartGql = {
  __typename?: 'CartGql';
  items: Array<CartLineGql>;
};

export type CartLineGql = {
  __typename?: 'CartLineGql';
  productId: Scalars['String']['output'];
  qty: Scalars['Float']['output'];
};

export type CheckoutResultGql = {
  __typename?: 'CheckoutResultGql';
  accepted: Scalars['Boolean']['output'];
  cartId: Scalars['String']['output'];
  channel: Scalars['String']['output'];
  correlationId: Scalars['String']['output'];
};

export type CreateTaskInputGql = {
  description?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<TaskPriority>;
  status?: InputMaybe<TaskStatus>;
  title: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addToCart: CartGql;
  checkout: CheckoutResultGql;
  createProduct: ProductGql;
  createTask: TaskGql;
  deleteTask: Scalars['Boolean']['output'];
  login: AuthPayloadGql;
  register: AuthPayloadGql;
  updateTask: TaskGql;
};

export type MutationAddToCartArgs = {
  productId: Scalars['String']['input'];
  qty: Scalars['Int']['input'];
};

export type MutationCreateProductArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  priceCents: Scalars['Int']['input'];
  stock?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationCreateTaskArgs = {
  input: CreateTaskInputGql;
};

export type MutationDeleteTaskArgs = {
  id: Scalars['String']['input'];
};

export type MutationLoginArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationRegisterArgs = {
  displayName?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationUpdateTaskArgs = {
  id: Scalars['String']['input'];
  input: UpdateTaskInputGql;
};

export type OrderGql = {
  __typename?: 'OrderGql';
  cartId: Scalars['String']['output'];
  correlationId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lines: Array<OrderLineGql>;
  status: Scalars['String']['output'];
  userId: Scalars['String']['output'];
};

export type OrderLineGql = {
  __typename?: 'OrderLineGql';
  id: Scalars['String']['output'];
  priceCents: Scalars['Float']['output'];
  productId: Scalars['String']['output'];
  quantity: Scalars['Float']['output'];
};

export type ProductGql = {
  __typename?: 'ProductGql';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  priceCents: Scalars['Float']['output'];
  stock: Scalars['Float']['output'];
};

export type Query = {
  __typename?: 'Query';
  cart: CartGql;
  me: UserGql;
  order?: Maybe<OrderGql>;
  orders: Array<OrderGql>;
  products: Array<ProductGql>;
  task?: Maybe<TaskGql>;
  tasks: TasksPageGql;
};

export type QueryOrderArgs = {
  id: Scalars['String']['input'];
};

export type QueryTaskArgs = {
  id: Scalars['String']['input'];
};

export type QueryTasksArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  priority?: InputMaybe<TaskPriority>;
  q?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<TaskStatus>;
};

export type TaskGql = {
  __typename?: 'TaskGql';
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  dueDate?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  priority: TaskPriority;
  status: TaskStatus;
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export enum TaskPriority {
  High = 'High',
  Low = 'Low',
  Medium = 'Medium',
}

export enum TaskStatus {
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

export type TasksPageGql = {
  __typename?: 'TasksPageGql';
  items: Array<TaskGql>;
  page: Scalars['Float']['output'];
  pageSize: Scalars['Float']['output'];
  totalItems: Scalars['Float']['output'];
  totalPages: Scalars['Float']['output'];
};

export type UpdateTaskInputGql = {
  description?: InputMaybe<Scalars['String']['input']>;
  dueDate?: InputMaybe<Scalars['String']['input']>;
  priority: TaskPriority;
  status: TaskStatus;
  title: Scalars['String']['input'];
};

export type UserGql = {
  __typename?: 'UserGql';
  displayName?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
};

export type LoginMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
}>;

export type LoginMutation = {
  __typename?: 'Mutation';
  login: {
    __typename?: 'AuthPayloadGql';
    accessToken: string;
    user: { __typename?: 'UserGql'; id: string; email: string };
  };
};

export type RegisterMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
  displayName?: InputMaybe<Scalars['String']['input']>;
}>;

export type RegisterMutation = {
  __typename?: 'Mutation';
  register: {
    __typename?: 'AuthPayloadGql';
    accessToken: string;
    user: { __typename?: 'UserGql'; id: string; email: string };
  };
};

export type AddToCartMutationVariables = Exact<{
  productId: Scalars['String']['input'];
  qty: Scalars['Int']['input'];
}>;

export type AddToCartMutation = {
  __typename?: 'Mutation';
  addToCart: {
    __typename?: 'CartGql';
    items: Array<{ __typename?: 'CartLineGql'; productId: string; qty: number }>;
  };
};

export type CheckoutMutationVariables = Exact<{ [key: string]: never }>;

export type CheckoutMutation = {
  __typename?: 'Mutation';
  checkout: {
    __typename?: 'CheckoutResultGql';
    accepted: boolean;
    correlationId: string;
    cartId: string;
    channel: string;
  };
};

export type CreateProductMutationVariables = Exact<{
  name: Scalars['String']['input'];
  priceCents: Scalars['Int']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  stock?: InputMaybe<Scalars['Int']['input']>;
}>;

export type CreateProductMutation = {
  __typename?: 'Mutation';
  createProduct: {
    __typename?: 'ProductGql';
    id: string;
    name: string;
    priceCents: number;
    stock: number;
  };
};

export type CreateTaskMutationVariables = Exact<{
  input: CreateTaskInputGql;
}>;

export type CreateTaskMutation = {
  __typename?: 'Mutation';
  createTask: {
    __typename?: 'TaskGql';
    id: string;
    title: string;
    description?: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type UpdateTaskMutationVariables = Exact<{
  id: Scalars['String']['input'];
  input: UpdateTaskInputGql;
}>;

export type UpdateTaskMutation = {
  __typename?: 'Mutation';
  updateTask: {
    __typename?: 'TaskGql';
    id: string;
    title: string;
    description?: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteTaskMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DeleteTaskMutation = { __typename?: 'Mutation'; deleteTask: boolean };

export type ProductsQueryVariables = Exact<{ [key: string]: never }>;

export type ProductsQuery = {
  __typename?: 'Query';
  products: Array<{
    __typename?: 'ProductGql';
    id: string;
    name: string;
    description?: string | null;
    priceCents: number;
    stock: number;
  }>;
};

export type CartQueryVariables = Exact<{ [key: string]: never }>;

export type CartQuery = {
  __typename?: 'Query';
  cart: {
    __typename?: 'CartGql';
    items: Array<{ __typename?: 'CartLineGql'; productId: string; qty: number }>;
  };
};

export type OrdersQueryVariables = Exact<{ [key: string]: never }>;

export type OrdersQuery = {
  __typename?: 'Query';
  orders: Array<{
    __typename?: 'OrderGql';
    id: string;
    correlationId: string;
    status: string;
    lines: Array<{ __typename?: 'OrderLineGql'; productId: string; quantity: number }>;
  }>;
};

export type TasksQueryVariables = Exact<{
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<TaskStatus>;
  priority?: InputMaybe<TaskPriority>;
  q?: InputMaybe<Scalars['String']['input']>;
}>;

export type TasksQuery = {
  __typename?: 'Query';
  tasks: {
    __typename?: 'TasksPageGql';
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    items: Array<{
      __typename?: 'TaskGql';
      id: string;
      title: string;
      description?: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      dueDate?: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
};

export type TaskQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type TaskQuery = {
  __typename?: 'Query';
  task?: {
    __typename?: 'TaskGql';
    id: string;
    title: string;
    description?: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export const LoginDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Login' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'login' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accessToken' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RegisterDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Register' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'displayName' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'register' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'displayName' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'displayName' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accessToken' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'user' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const AddToCartDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddToCart' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'qty' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addToCart' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'productId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'productId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'qty' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'qty' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'productId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'qty' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddToCartMutation, AddToCartMutationVariables>;
export const CheckoutDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Checkout' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'checkout' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'accepted' } },
                { kind: 'Field', name: { kind: 'Name', value: 'correlationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cartId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'channel' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CheckoutMutation, CheckoutMutationVariables>;
export const CreateProductDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProduct' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'priceCents' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'description' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'stock' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProduct' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'priceCents' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'priceCents' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'description' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'description' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'stock' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'stock' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceCents' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stock' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateProductMutation, CreateProductMutationVariables>;
export const CreateTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateTask' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateTaskInputGql' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createTask' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
                { kind: 'Field', name: { kind: 'Name', value: 'dueDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateTaskMutation, CreateTaskMutationVariables>;
export const UpdateTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateTask' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateTaskInputGql' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateTask' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
                { kind: 'Field', name: { kind: 'Name', value: 'dueDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateTaskMutation, UpdateTaskMutationVariables>;
export const DeleteTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteTask' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteTask' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteTaskMutation, DeleteTaskMutationVariables>;
export const ProductsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Products' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'products' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priceCents' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stock' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ProductsQuery, ProductsQueryVariables>;
export const CartDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Cart' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'cart' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'productId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'qty' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CartQuery, CartQueryVariables>;
export const OrdersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Orders' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'orders' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'correlationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'lines' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'productId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OrdersQuery, OrdersQueryVariables>;
export const TasksDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Tasks' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'page' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'pageSize' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'TaskStatus' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'priority' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'TaskPriority' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'q' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tasks' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'page' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'page' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'pageSize' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'pageSize' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'priority' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'priority' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'q' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'q' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'dueDate' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'page' } },
                { kind: 'Field', name: { kind: 'Name', value: 'pageSize' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalItems' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalPages' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TasksQuery, TasksQueryVariables>;
export const TaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Task' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'task' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
                { kind: 'Field', name: { kind: 'Name', value: 'dueDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TaskQuery, TaskQueryVariables>;
