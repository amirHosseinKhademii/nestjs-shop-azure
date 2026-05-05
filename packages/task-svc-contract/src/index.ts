import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './generated/schema';

export type { paths } from './generated/schema';

export type TaskSvcOpenApiClient = Client<paths>;

/** Typed HTTP client for task-svc OpenAPI paths (fetch-based). */
export function createTaskSvcClient(baseUrl: string): TaskSvcOpenApiClient {
  return createClient<paths>({ baseUrl: baseUrl.replace(/\/$/, '') });
}
