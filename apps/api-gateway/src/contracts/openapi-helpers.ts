import { HttpException } from '@nestjs/common';

type OpenApiFetchResult<T> = { data?: T; error?: unknown };

function guessStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const anyErr = error as { status?: unknown; response?: unknown };
  if (typeof anyErr.status === 'number') return anyErr.status;
  if (anyErr.response && typeof anyErr.response === 'object') {
    const r = anyErr.response as { status?: unknown };
    if (typeof r.status === 'number') return r.status;
  }
  return undefined;
}

function guessMessage(error: unknown): string {
  if (!error) return 'Upstream request failed';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Upstream request failed';
  }
}

export function unwrapOrThrow<T>(res: OpenApiFetchResult<T>): T {
  if (!res.error) return res.data as T;
  throw new HttpException(guessMessage(res.error), guessStatus(res.error) ?? 502);
}
