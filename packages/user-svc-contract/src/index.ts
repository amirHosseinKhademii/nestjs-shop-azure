import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './generated/schema';

export type { paths } from './generated/schema';

export type UserSvcOpenApiClient = Client<paths>;

export function createUserSvcClient(baseUrl: string): UserSvcOpenApiClient {
  return createClient<paths>({ baseUrl: baseUrl.replace(/\/$/, '') });
}
