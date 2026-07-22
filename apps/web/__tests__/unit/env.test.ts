import {
  resolveApiBaseUrl,
  resolveWsUrl,
  DEFAULT_API_BASE_URL,
  DEFAULT_WS_URL,
} from '../../src/lib/env';

describe('resolveApiBaseUrl', () => {
  it('uses the configured value when set', () => {
    expect(resolveApiBaseUrl('https://api.example.com/api/v1')).toBe(
      'https://api.example.com/api/v1',
    );
  });

  it('falls back to the local backend port when unset', () => {
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
  });

  it('falls back when the value is an empty string', () => {
    expect(resolveApiBaseUrl('')).toBe(DEFAULT_API_BASE_URL);
  });

  it('falls back when the value is only whitespace', () => {
    expect(resolveApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });

  it('defaults to port 4000, the port the backend actually listens on', () => {
    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:4000/api/v1');
  });

  it('keeps the /api/v1 prefix the backend requires', () => {
    expect(DEFAULT_API_BASE_URL).toContain('/api/v1');
  });
});

describe('resolveWsUrl', () => {
  it('uses the configured value when set', () => {
    expect(resolveWsUrl('https://api.example.com')).toBe('https://api.example.com');
  });

  it('falls back to the local backend port when unset', () => {
    expect(resolveWsUrl(undefined)).toBe(DEFAULT_WS_URL);
  });

  it('defaults to port 4000 without the api prefix', () => {
    expect(DEFAULT_WS_URL).toBe('http://localhost:4000');
  });

  it('strips a trailing slash so `${url}/sync` stays well formed', () => {
    expect(resolveWsUrl('https://api.example.com/')).toBe('https://api.example.com');
  });
});
