import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../../src/modules/auth/strategies/jwt.strategy';
import { AuthService } from '../../src/modules/auth/auth.service';

describe('JwtStrategy', () => {
  const authService = {
    validateJwtPayload: jest.fn(),
  } as unknown as AuthService;

  const buildConfig = (secret?: string) =>
    ({
      get: jest.fn((key: string) =>
        key === 'JWT_ACCESS_SECRET' ? secret : undefined,
      ),
    }) as unknown as ConfigService;

  it('constructs when JWT_ACCESS_SECRET is configured', () => {
    expect(
      () => new JwtStrategy(buildConfig('a'.repeat(32)), authService),
    ).not.toThrow();
  });

  it('throws instead of falling back to a hardcoded secret', () => {
    expect(() => new JwtStrategy(buildConfig(undefined), authService)).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('throws when the secret is an empty string', () => {
    expect(() => new JwtStrategy(buildConfig(''), authService)).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('delegates payload validation to AuthService', async () => {
    const strategy = new JwtStrategy(buildConfig('a'.repeat(32)), authService);
    const payload = {
      sub: 'user-1',
      email: 'admin@cafe.com',
      role: 'ORG_ADMIN' as const,
      organizationId: 'org-1',
      storeId: null,
    };

    await strategy.validate(payload);

    expect(authService.validateJwtPayload).toHaveBeenCalledWith(payload);
  });
});
