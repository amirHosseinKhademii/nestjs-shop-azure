export interface Product {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  stock: number;
}

export interface CartItem {
  productId: string;
  qty: number;
}

export interface Cart {
  items: CartItem[];
}

export interface OrderLine {
  productId: string;
  quantity: number;
}

export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'FULFILLED' | string;

export interface Order {
  id: string;
  correlationId: string;
  status: OrderStatus;
  lines: OrderLine[];
}

export interface AuthPayload {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

export interface CheckoutResult {
  accepted: boolean;
  correlationId: string;
  cartId: string;
  channel: string;
}

export interface ProductsQuery {
  products: Product[];
}

export interface CartQuery {
  cart: Cart;
}

export interface OrdersQuery {
  orders: Order[];
}

export interface LoginMutation {
  login: AuthPayload;
}
export interface LoginVars {
  email: string;
  password: string;
}

export interface RegisterMutation {
  register: AuthPayload;
}
export interface RegisterVars {
  email: string;
  password: string;
  displayName?: string;
}

export interface AddToCartMutation {
  addToCart: Cart;
}
export interface AddToCartVars {
  productId: string;
  qty: number;
}

export interface CheckoutMutation {
  checkout: CheckoutResult;
}

export interface CreateProductMutation {
  createProduct: Product;
}
export interface CreateProductVars {
  name: string;
  priceCents: number;
  description?: string;
  stock?: number;
}
