import { api, ApiError } from '../../src/lib/api-client';

describe('api-client 401 handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.setItem('accessToken', 'token-a');
    window.localStorage.setItem('refreshToken', 'token-b');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('does not clear tokens on a 401 from /me/password (wrong current password)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Current password is incorrect' }),
    }) as unknown as typeof fetch;

    await expect(
      api.patch('/me/password', { currentPassword: 'wrong', newPassword: 'new-password-123' }),
    ).rejects.toMatchObject({ status: 401, message: 'Current password is incorrect' });

    expect(window.localStorage.getItem('accessToken')).toBe('token-a');
    expect(window.localStorage.getItem('refreshToken')).toBe('token-b');
  });

  it('still clears tokens on a 401 from other routes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Unauthorized' }),
    }) as unknown as typeof fetch;

    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);

    expect(window.localStorage.getItem('accessToken')).toBeNull();
    expect(window.localStorage.getItem('refreshToken')).toBeNull();
  });
});
