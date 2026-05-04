import { validateRedisUrl } from './redis.module';

describe('validateRedisUrl', () => {
  it('accepts a plain redis:// URL', () => {
    const { url, parsed } = validateRedisUrl('redis://127.0.0.1:6379');
    expect(url).toBe('redis://127.0.0.1:6379');
    expect(parsed.protocol).toBe('redis:');
    expect(parsed.hostname).toBe('127.0.0.1');
  });

  it('accepts a TLS rediss:// URL with credentials', () => {
    const { parsed } = validateRedisUrl(
      'rediss://default:secret@top-gazelle-112090.upstash.io:6379',
    );
    expect(parsed.protocol).toBe('rediss:');
    expect(parsed.hostname).toBe('top-gazelle-112090.upstash.io');
    expect(parsed.password).toBe('secret');
  });

  it('trims surrounding whitespace', () => {
    const { url } = validateRedisUrl('  redis://localhost:6379\n');
    expect(url).toBe('redis://localhost:6379');
  });

  it('rejects empty / whitespace-only values', () => {
    expect(() => validateRedisUrl('')).toThrow(/empty/i);
    expect(() => validateRedisUrl('   ')).toThrow(/empty/i);
  });

  // Regression: someone pasted the entire `redis-cli --tls -u redis://...`
  // example from the Upstash console as the secret value. Previously this
  // surfaced as `connect ENOENT` per request, ~14 s after the call.
  it('rejects a pasted `redis-cli ...` command line', () => {
    expect(() =>
      validateRedisUrl('redis-cli --tls -u redis://default:x@host.upstash.io:6379'),
    ).toThrow(/not a valid URL/i);
  });

  it('rejects unsupported schemes', () => {
    expect(() => validateRedisUrl('http://localhost:6379')).toThrow(/unsupported scheme/i);
    expect(() => validateRedisUrl('tcp://localhost:6379')).toThrow(/unsupported scheme/i);
  });

  it('rejects URLs missing a hostname', () => {
    expect(() => validateRedisUrl('redis://')).toThrow();
  });

  it('does NOT include the URL in the error (avoids leaking passwords)', () => {
    const secret = 'super-secret-token-do-not-leak';
    try {
      validateRedisUrl(`weird-prefix redis://default:${secret}@host:6379`);
      fail('expected validation to throw');
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });
});
