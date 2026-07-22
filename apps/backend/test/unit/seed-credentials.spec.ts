import {
  resolveSeedPassword,
  requireBootstrapCredentials,
  MIN_BOOTSTRAP_PASSWORD_LENGTH,
} from '../../src/database/seed-credentials';

describe('resolveSeedPassword', () => {
  it('uses the value from env when provided', () => {
    expect(
      resolveSeedPassword('SEED_ADMIN_PASSWORD', {
        SEED_ADMIN_PASSWORD: 'from-env',
      }),
    ).toBe('from-env');
  });

  it('falls back to the demo password outside production', () => {
    expect(
      resolveSeedPassword('SEED_ADMIN_PASSWORD', {
        NODE_ENV: 'development',
      }),
    ).toBe('Admin@123456');
  });

  it('falls back when NODE_ENV is unset', () => {
    expect(resolveSeedPassword('SEED_STORE_PASSWORD', {})).toBe('Store@123456');
  });

  it('refuses to use a default password in production', () => {
    expect(() =>
      resolveSeedPassword('SEED_ADMIN_PASSWORD', { NODE_ENV: 'production' }),
    ).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it('treats an empty value as missing in production', () => {
    expect(() =>
      resolveSeedPassword('SEED_ADMIN_PASSWORD', {
        NODE_ENV: 'production',
        SEED_ADMIN_PASSWORD: '',
      }),
    ).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it('accepts an explicit password in production', () => {
    expect(
      resolveSeedPassword('SEED_ADMIN_PASSWORD', {
        NODE_ENV: 'production',
        SEED_ADMIN_PASSWORD: 'a-real-strong-password',
      }),
    ).toBe('a-real-strong-password');
  });

  it('rejects an unknown seed variable name', () => {
    expect(() => resolveSeedPassword('SEED_UNKNOWN', {})).toThrow(
      /SEED_UNKNOWN/,
    );
  });
});

describe('requireBootstrapCredentials', () => {
  const validEnv = {
    BOOTSTRAP_ADMIN_EMAIL: 'owner@cafe.com',
    BOOTSTRAP_ADMIN_PASSWORD: 'a-long-enough-password',
  };

  it('returns the configured email and password', () => {
    const result = requireBootstrapCredentials(validEnv);

    expect(result.email).toBe('owner@cafe.com');
    expect(result.password).toBe('a-long-enough-password');
  });

  it('throws when the email is missing', () => {
    expect(() =>
      requireBootstrapCredentials({
        BOOTSTRAP_ADMIN_PASSWORD: 'a-long-enough-password',
      }),
    ).toThrow(/BOOTSTRAP_ADMIN_EMAIL/);
  });

  it('throws when the password is missing', () => {
    expect(() =>
      requireBootstrapCredentials({
        BOOTSTRAP_ADMIN_EMAIL: 'owner@cafe.com',
      }),
    ).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
  });

  it('rejects a password shorter than the minimum', () => {
    expect(() =>
      requireBootstrapCredentials({
        ...validEnv,
        BOOTSTRAP_ADMIN_PASSWORD: 'short',
      }),
    ).toThrow(new RegExp(String(MIN_BOOTSTRAP_PASSWORD_LENGTH)));
  });

  it('rejects a malformed email', () => {
    expect(() =>
      requireBootstrapCredentials({
        ...validEnv,
        BOOTSTRAP_ADMIN_EMAIL: 'nope',
      }),
    ).toThrow(/BOOTSTRAP_ADMIN_EMAIL/);
  });

  it('defaults the organization name and slug', () => {
    const result = requireBootstrapCredentials(validEnv);

    expect(result.organizationName).toBe('Cafe Music');
    expect(result.organizationSlug).toBe('cafe-music');
  });

  it('allows overriding the organization name and slug', () => {
    const result = requireBootstrapCredentials({
      ...validEnv,
      BOOTSTRAP_ORG_NAME: 'Highlands Coffee',
      BOOTSTRAP_ORG_SLUG: 'highlands',
    });

    expect(result.organizationName).toBe('Highlands Coffee');
    expect(result.organizationSlug).toBe('highlands');
  });

  it('derives an ascii slug from a Vietnamese organization name', () => {
    const result = requireBootstrapCredentials({
      ...validEnv,
      BOOTSTRAP_ORG_NAME: 'Quán Cà Phê Đường Phố',
    });

    expect(result.organizationSlug).toBe('quan-ca-phe-duong-pho');
  });

  it('derives a slug from a custom organization name', () => {
    const result = requireBootstrapCredentials({
      ...validEnv,
      BOOTSTRAP_ORG_NAME: 'The Coffee House',
    });

    expect(result.organizationSlug).toBe('the-coffee-house');
  });
});
