import type { Request, Response } from 'express';

/** JWT payload attached to `req.user` after `GqlJwtGuard`. */
export type JwtUserPayload = { sub: string; email: string };

export type GatewayGraphqlRequest = Request & {
  user?: JwtUserPayload;
  correlationId?: string;
};

export type GatewayGraphqlContext = {
  req: GatewayGraphqlRequest;
  res: Response;
  /** Single string after normalizing header / middleware values. */
  correlationId?: string;
};

/** Apollo `context` callback receives raw Express request/response. */
export type ApolloContextFactoryArgs = {
  req: Request & { correlationId?: string };
  res: Response;
};

export interface ShopProductDto {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  priceCents: number;
  stock?: number;
}

export interface OrderLineDto {
  id: string;
  productId: string;
  quantity: number;
  priceCents: number;
}

export interface OrderDto {
  id: string;
  userId: string;
  cartId: string;
  correlationId?: string;
  status: string;
  lines?: OrderLineDto[];
}

export function pickCorrelationId(req: ApolloContextFactoryArgs['req']): string | undefined {
  if (req.correlationId) return req.correlationId;
  const h = req.headers['x-correlation-id'];
  if (Array.isArray(h)) return h[0];
  return h;
}
