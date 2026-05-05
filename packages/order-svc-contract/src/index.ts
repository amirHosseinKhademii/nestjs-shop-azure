import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './generated/schema';

export type { paths } from './generated/schema';

export type OrderSvcOpenApiClient = Client<paths>;

export function createOrderSvcClient(baseUrl: string): OrderSvcOpenApiClient {
  return createClient<paths>({ baseUrl: baseUrl.replace(/\/$/, '') });
}
