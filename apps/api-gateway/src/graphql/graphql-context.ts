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
  if (typeof req.correlationId === 'string' && req.correlationId.trim()) {
    return req.correlationId.trim();
  }
  const h = req.headers['x-correlation-id'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  const first = Array.isArray(h) ? h[0] : undefined;
  if (typeof first === 'string' && first.trim()) return first.trim();
  return undefined;
}
