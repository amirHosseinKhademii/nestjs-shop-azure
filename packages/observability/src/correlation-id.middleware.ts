import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Express `Request` extended with the resolved correlation id for handlers that
 * want typed access without re-parsing headers.
 */
export type RequestWithCorrelationId = Request & { correlationId?: string };

/**
 * Reads `x-correlation-id` from the incoming request, supporting a single string or
 * the first element when proxies send an array. Trims whitespace. If absent or empty,
 * generates a new UUID v4 so every request has a stable id for logs and tracing.
 *
 * @param req - Incoming Express request.
 * @returns Correlation id to attach to the request and response.
 */
function pickCorrelationId(req: Request): string {
  const raw = req.headers['x-correlation-id'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const first = Array.isArray(raw) ? raw[0] : undefined;
  if (typeof first === 'string' && first.trim()) return first.trim();
  return randomUUID();
}

/**
 * Express middleware that guarantees a **correlation id** for the request lifecycle:
 * copies or creates an id, stores it on `req.correlationId`, and echoes it on the
 * response as `x-correlation-id` so browsers and downstream services can propagate it.
 *
 * Mount early in `main.ts` (before Nest routes) so all layers see the same value.
 *
 * @param req - Express request; narrowed to {@link RequestWithCorrelationId} for `correlationId`.
 * @param res - Express response; header is set before `next()`.
 * @param next - Continues the middleware chain.
 */
export function correlationIdMiddleware(
  req: RequestWithCorrelationId,
  res: Response,
  next: NextFunction,
): void {
  const id = pickCorrelationId(req);
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}
