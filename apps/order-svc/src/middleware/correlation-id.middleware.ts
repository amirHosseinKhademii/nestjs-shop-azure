import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithCorrelationId = Request & { correlationId?: string };

function pickCorrelationId(req: Request): string {
  const raw = req.headers['x-correlation-id'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const first = Array.isArray(raw) ? raw[0] : undefined;
  if (typeof first === 'string' && first.trim()) return first.trim();
  return randomUUID();
}

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
