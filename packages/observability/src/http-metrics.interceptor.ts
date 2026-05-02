import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Histogram, register } from 'prom-client';

/**
 * Histogram shared by all HTTP requests in the process. Labels are intentionally
 * limited to `method`, `route`, and `status_code` so Prometheus / Mimir cardinality
 * stays predictable. `route` values are normalized by {@link normalizeRoute}.
 */
const httpDuration = new Histogram({
  name: 'shop_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Collapses high-cardinality path segments (UUIDs, ObjectIds, numeric ids) into
 * stable placeholders (`/:id`, `/:num`) so the `route` label on HTTP metrics does
 * not explode when users hit `/orders/123` vs `/orders/456`.
 *
 * @param url - Raw path or URL (query string is stripped before normalization).
 * @returns A template-style route safe to use as a Prometheus label value.
 */
export function normalizeRoute(url: string): string {
  let u = (url.split('?')[0] ?? url).trim() || '/';
  u = u.replace(
    /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    '/:id',
  );
  u = u.replace(/\/[0-9a-f]{24}/g, '/:id');
  u = u.replace(/\/\d+/g, '/:num');
  return u;
}

/**
 * Nest global interceptor that records **request duration** and **status code**
 * for each finished HTTP request into `shop_http_request_duration_seconds`.
 *
 * - Skips non-HTTP contexts (e.g. GraphQL-only execution contexts that are not HTTP)
 *   so only Express HTTP traffic is measured here.
 * - Uses `finalize` so the observation runs whether the handler completes or throws
 *   (status may still reflect what Express set on the response).
 * - Prefers Nest’s mounted `route.path` + `baseUrl` when available for a stable route
 *   template; otherwise falls back to `req.path` / `req.url`.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  /**
   * Measures wall time from entry until the outbound Observable completes, then
   * records one histogram sample with the response status code as a string label.
   *
   * @param context - Nest execution context; must be `'http'` to record metrics.
   * @param next - Downstream handler chain.
   * @returns The same Observable as `next.handle()`, with side effects on finalize.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    const nestRoute = (req as Request & { route?: { path?: string } }).route?.path;
    const route = normalizeRoute(
      nestRoute
        ? `${(req as Request & { baseUrl?: string }).baseUrl ?? ''}${nestRoute}`
        : (req.path ?? req.url ?? '/'),
    );
    const method = req.method ?? 'UNKNOWN';

    return next.handle().pipe(
      tap({
        finalize: () => {
          const seconds = Number(process.hrtime.bigint() - start) / 1e9;
          const statusCode = String(res.statusCode ?? 500);
          httpDuration.observe({ method, route, status_code: statusCode }, seconds);
        },
      }),
    );
  }
}
