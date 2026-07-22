import {
  buildLoggerOptions,
  shouldSkipRequestLog,
} from '../../src/config/logger.config';

describe('buildLoggerOptions', () => {
  it('emits raw JSON in production so the platform can parse it', () => {
    const options = buildLoggerOptions({ NODE_ENV: 'production' });

    expect(options.pinoHttp?.transport).toBeUndefined();
  });

  it('uses a human readable transport in development', () => {
    const options = buildLoggerOptions({ NODE_ENV: 'development' });

    expect(options.pinoHttp?.transport).toEqual(
      expect.objectContaining({ target: 'pino-pretty' }),
    );
  });

  it('defaults to info level', () => {
    expect(buildLoggerOptions({ NODE_ENV: 'production' }).pinoHttp?.level).toBe(
      'info',
    );
  });

  it('honours an explicit LOG_LEVEL', () => {
    const options = buildLoggerOptions({
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
    });

    expect(options.pinoHttp?.level).toBe('debug');
  });

  it('redacts the authorization header', () => {
    const redact = buildLoggerOptions({ NODE_ENV: 'production' }).pinoHttp
      ?.redact;

    expect(redact).toEqual(
      expect.arrayContaining(['req.headers.authorization']),
    );
  });

  it('redacts cookies so session material never reaches the log', () => {
    const redact = buildLoggerOptions({ NODE_ENV: 'production' }).pinoHttp
      ?.redact;

    expect(redact).toEqual(expect.arrayContaining(['req.headers.cookie']));
  });

  // Mặc định pino-http dump toàn bộ header trên mọi request → phình log
  it('logs only the useful request fields, not every header', () => {
    const serializers = buildLoggerOptions({ NODE_ENV: 'production' }).pinoHttp
      .serializers;
    const serialized = serializers?.req({
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/tracks',
      headers: { authorization: 'Bearer secret', cookie: 'session=abc' },
    });

    expect(serialized).toEqual({
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/tracks',
    });
  });

  it('logs only the status code from the response', () => {
    const serializers = buildLoggerOptions({ NODE_ENV: 'production' }).pinoHttp
      .serializers;

    expect(serializers?.res({ statusCode: 401, headers: { a: 'b' } })).toEqual({
      statusCode: 401,
    });
  });
});

describe('shouldSkipRequestLog', () => {
  // Railway gọi probe vài giây một lần — log hết thì trôi mất log thật
  it('skips the liveness probe', () => {
    expect(shouldSkipRequestLog('/api/v1/health')).toBe(true);
  });

  it('skips the readiness probe', () => {
    expect(shouldSkipRequestLog('/api/v1/health/ready')).toBe(true);
  });

  it('skips a probe carrying a query string', () => {
    expect(shouldSkipRequestLog('/api/v1/health?probe=1')).toBe(true);
  });

  it('logs real API traffic', () => {
    expect(shouldSkipRequestLog('/api/v1/tracks')).toBe(false);
  });

  it('does not skip a route that merely starts with the health prefix', () => {
    expect(shouldSkipRequestLog('/api/v1/healthcheck-settings')).toBe(false);
  });

  it('tolerates a missing url', () => {
    expect(shouldSkipRequestLog(undefined)).toBe(false);
  });
});
