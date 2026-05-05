import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './generated/schema';

export type { paths } from './generated/schema';

export type ShopSvcOpenApiClient = Client<paths>;

export function createShopSvcClient(baseUrl: string): ShopSvcOpenApiClient {
  return createClient<paths>({ baseUrl: baseUrl.replace(/\/$/, '') });
}
