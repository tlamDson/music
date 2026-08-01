import { scrubAuthPayloads } from '../../src/instrument';

describe('scrubAuthPayloads', () => {
  /**
   * Body của login/refresh mang mật khẩu và refresh token. pino đã redact
   * chúng trong log — Sentry phải giữ đúng mức đó, nếu không credential rời
   * khỏi server qua đường thứ hai mà không ai để ý.
   */
  it('redacts the body of login errors', () => {
    const event = {
      request: {
        url: 'https://api.cafe-music.app/api/v1/auth/login',
        data: { email: 'admin@cafe.vn', password: 'super-secret' },
      },
    };

    expect(scrubAuthPayloads(event).request.data).toBe('[redacted]');
  });

  it('redacts the body of refresh errors', () => {
    const event = {
      request: {
        url: '/api/v1/auth/refresh',
        data: { refreshToken: 'eyJhbGciOi...' },
      },
    };

    expect(scrubAuthPayloads(event).request.data).toBe('[redacted]');
  });

  it('leaves other requests untouched so the report stays useful', () => {
    const data = { playlistId: 'playlist-1' };
    const event = {
      request: { url: '/api/v1/sync/stores/store-1/play', data },
    };

    expect(scrubAuthPayloads(event).request.data).toBe(data);
  });

  it('survives an event with no request attached', () => {
    const event = { message: 'boom' } as { request?: { url?: string } };

    expect(() => scrubAuthPayloads(event)).not.toThrow();
  });
});
