import { Reflector } from '@nestjs/core';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
    refreshTokens: jest.fn(),
  } as unknown as AuthService;

  const controller = new AuthController(authService);
  const reflector = new Reflector();

  // @nestjs/throttler không export các hằng số này ra public API.
  const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
  const THROTTLER_TTL = 'THROTTLER:TTL';

  /**
   * @Throttle({ default: {...} }) gắn metadata dạng `THROTTLER_LIMIT + name`
   * lên method — đọc lại để chắc endpoint thực sự bị giới hạn.
   */
  const throttleMetadata = (methodName: 'login' | 'refresh') => {
    const handler = AuthController.prototype[methodName];
    return {
      limit: reflector.get<number>(`${THROTTLER_LIMIT}default`, handler),
      ttl: reflector.get<number>(`${THROTTLER_TTL}default`, handler),
    };
  };

  it('rate limits the login endpoint', () => {
    const { limit } = throttleMetadata('login');

    expect(limit).toBeDefined();
    expect(limit).toBeLessThanOrEqual(10);
  });

  it('applies a 60s window to login', () => {
    expect(throttleMetadata('login').ttl).toBe(60000);
  });

  it('rate limits the refresh endpoint', () => {
    expect(throttleMetadata('refresh').limit).toBeDefined();
  });

  it('delegates login to AuthService', async () => {
    const body = { email: 'admin@cafe.com', password: 'secret' };

    await controller.login(body);

    expect(authService.login).toHaveBeenCalledWith(body);
  });

  it('delegates refresh to AuthService', async () => {
    await controller.refresh({ refreshToken: 'token-1' });

    expect(authService.refreshTokens).toHaveBeenCalledWith('token-1');
  });
});
