// Per-worker environment (runs before each test file imports app code).
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55432/observe_metrics_test?schema=public";
process.env.APP_URL = "http://localhost:3100";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.ENCRYPTION_KEY = "5f1c2a9e8b7d6c5a4f3e2d1c0b9a8f7e6d5c4b3a29181716151413121110a0b0";
delete process.env.REDIS_URL;
delete process.env.SMTP_HOST;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.CRON_SECRET;
// NODE_ENV is "test" under vitest; production-only guards stay inactive.
