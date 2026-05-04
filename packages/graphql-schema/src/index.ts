import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type DocumentNode } from 'graphql';

/**
 * Absolute path to the bundled `schema.graphql` SDL file. Useful for tools
 * (graphql-codegen, graphql-inspector, mock servers) that accept a file path.
 */
export const schemaPath: string = join(__dirname, '..', 'schema.graphql');

/**
 * Raw SDL string. Lazily read from disk on first access so the cost is paid
 * only by consumers that actually need it in-process.
 */
let cachedTypeDefs: string | undefined;
export function getTypeDefs(): string {
  if (cachedTypeDefs === undefined) {
    cachedTypeDefs = readFileSync(schemaPath, 'utf8') as string;
  }
  return cachedTypeDefs;
}

/**
 * Parsed `DocumentNode` form of the SDL, suitable for passing to
 * `makeExecutableSchema`, Apollo Server, mock servers, etc.
 */
let cachedDocument: DocumentNode | undefined;
export function getSchemaDocument(): DocumentNode {
  if (cachedDocument === undefined) {
    cachedDocument = parse(getTypeDefs());
  }
  return cachedDocument;
}
