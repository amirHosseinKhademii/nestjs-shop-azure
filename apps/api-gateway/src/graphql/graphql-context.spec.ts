import type { Request } from 'express';
import { pickCorrelationId } from './graphql-context';

function req(partial: Partial<Request> & { correlationId?: string }): Request & {
  correlationId?: string;
} {
  return partial as Request & { correlationId?: string };
}

describe('pickCorrelationId', () => {
  it('prefers req.correlationId', () => {
    expect(
      pickCorrelationId(
        req({
          correlationId: 'from-mw',
          headers: { 'x-correlation-id': 'from-header' },
        }),
      ),
    ).toBe('from-mw');
  });

  it('reads string header', () => {
    expect(
      pickCorrelationId(
        req({
          headers: { 'x-correlation-id': 'abc' },
        }),
      ),
    ).toBe('abc');
  });

  it('reads first array header value', () => {
    expect(
      pickCorrelationId(
        req({
          headers: { 'x-correlation-id': ['first', 'second'] },
        }),
      ),
    ).toBe('first');
  });

  it('returns undefined when absent', () => {
    expect(pickCorrelationId(req({ headers: {} }))).toBeUndefined();
  });
});
