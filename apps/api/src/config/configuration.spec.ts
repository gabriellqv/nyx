import { validateEnvironment } from './configuration';

describe('Environment configuration', () => {
  const databaseUrl = 'postgresql://nyx_user:nyx_password@localhost:5432/nyx_test';

  it('should require a strong JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow('JWT_SECRET');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'short',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('should accept a strong JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'a-production-secret-with-at-least-32-characters',
        WEBHOOK_SECRET_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
      }),
    ).not.toThrow();
  });

  it('should require a valid webhook secret encryption key in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'a-production-secret-with-at-least-32-characters',
      }),
    ).toThrow('WEBHOOK_SECRET_ENCRYPTION_KEY');
  });
});
