import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export type ManagementSvcOpenApiClient = ReturnType<typeof createManagementSvcClient>;

export function createManagementSvcClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export type Employee = components['schemas']['Employee'];
export type AddEmployeeRequest = components['schemas']['AddEmployeeRequest'];
export type ValidationError = components['schemas']['ValidationError'];
export type ValidationErrors = components['schemas']['ValidationErrors'];
export type AddEmployeeResponse = components['schemas']['AddEmployeeResponse'];
export type UpdateEmployeeResponse = components['schemas']['UpdateEmployeeResponse'];
export type DeleteResponse = components['schemas']['DeleteResponse'];
