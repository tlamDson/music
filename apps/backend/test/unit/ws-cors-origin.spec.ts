import { resolveWsCorsOrigin } from '../../src/modules/sync/ws-cors-origin';

describe('resolveWsCorsOrigin', () => {
  it('restricts to WEB_URL in production', () => {
    expect(
      resolveWsCorsOrigin({
        NODE_ENV: 'production',
        WEB_URL: 'https://app.example.com',
      }),
    ).toEqual(['https://app.example.com']);
  });

  it('never falls back to a wildcard in production', () => {
    const origin = resolveWsCorsOrigin({ NODE_ENV: 'production' });

    expect(origin).not.toBe('*');
    expect(origin).not.toContain('*');
  });

  it('falls back to localhost when WEB_URL is missing in production', () => {
    expect(resolveWsCorsOrigin({ NODE_ENV: 'production' })).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('allows any origin in development for convenience', () => {
    expect(resolveWsCorsOrigin({ NODE_ENV: 'development', WEB_URL: 'x' })).toBe(
      true,
    );
  });

  it('allows any origin when NODE_ENV is unset', () => {
    expect(resolveWsCorsOrigin({})).toBe(true);
  });
});
