import { validateEnv } from '../../src/config/env.schema';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'production',
    PORT: '4000',
    DATABASE_URL: 'postgresql://user:pass@host:5432/db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    WEB_URL: 'https://app.example.com',
    S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    S3_REGION: 'auto',
    S3_BUCKET: 'cafe-music',
    S3_ACCESS_KEY: 'access-key',
    S3_SECRET_KEY: 'secret-key',
    S3_FORCE_PATH_STYLE: 'true',
  };

  it('accepts a complete valid production env', () => {
    const result = validateEnv(validEnv);

    expect(result.NODE_ENV).toBe('production');
    expect(result.PORT).toBe(4000);
    expect(result.JWT_ACCESS_SECRET).toBe('a'.repeat(32));
  });

  it('coerces PORT to a number', () => {
    const result = validateEnv(validEnv);

    expect(typeof result.PORT).toBe('number');
  });

  it('coerces S3_FORCE_PATH_STYLE to a boolean', () => {
    expect(validateEnv(validEnv).S3_FORCE_PATH_STYLE).toBe(true);
    expect(
      validateEnv({ ...validEnv, S3_FORCE_PATH_STYLE: 'false' })
        .S3_FORCE_PATH_STYLE,
    ).toBe(false);
  });

  it('throws when JWT_ACCESS_SECRET is missing', () => {
    const { JWT_ACCESS_SECRET: _omitted, ...env } = validEnv;

    expect(() => validateEnv(env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when a JWT secret is shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_REFRESH_SECRET: 'too-short' }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omitted, ...env } = validEnv;

    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('throws when REDIS_URL is missing', () => {
    const { REDIS_URL: _omitted, ...env } = validEnv;

    expect(() => validateEnv(env)).toThrow(/REDIS_URL/);
  });

  it('throws when REDIS_URL is not a redis connection string', () => {
    expect(() =>
      validateEnv({ ...validEnv, REDIS_URL: 'http://localhost:6379' }),
    ).toThrow(/REDIS_URL/);
  });

  it('accepts a TLS redis url', () => {
    const result = validateEnv({
      ...validEnv,
      REDIS_URL: 'rediss://default:pw@host.railway.internal:6379',
    });

    expect(result.REDIS_URL).toBe(
      'rediss://default:pw@host.railway.internal:6379',
    );
  });

  it('reports every missing variable in a single error message', () => {
    const {
      JWT_ACCESS_SECRET: _a,
      DATABASE_URL: _b,
      S3_BUCKET: _c,
      ...env
    } = validEnv;

    expect(() => validateEnv(env)).toThrow(
      /JWT_ACCESS_SECRET[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/,
    );
  });

  it('defaults PORT and NODE_ENV when not provided', () => {
    const { PORT: _p, NODE_ENV: _n, ...env } = validEnv;
    const result = validateEnv(env);

    expect(result.PORT).toBe(4000);
    expect(result.NODE_ENV).toBe('development');
  });

  it('allows CDN_BASE_URL to be omitted', () => {
    expect(validateEnv(validEnv).CDN_BASE_URL).toBeUndefined();
  });

  it('keeps env vars that are not declared in the schema', () => {
    const result = validateEnv({
      ...validEnv,
      APP_URL: 'http://localhost:4000',
      SPOTIFY_CLIENT_ID: 'spotify-id',
    }) as Record<string, unknown>;

    expect(result.APP_URL).toBe('http://localhost:4000');
    expect(result.SPOTIFY_CLIENT_ID).toBe('spotify-id');
  });

  it('rejects an unknown NODE_ENV value', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging-ish' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('accepts development, test and production for NODE_ENV', () => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      expect(validateEnv({ ...validEnv, NODE_ENV: nodeEnv }).NODE_ENV).toBe(
        nodeEnv,
      );
    }
  });
});
