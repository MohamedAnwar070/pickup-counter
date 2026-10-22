/**
 * Jest setupFiles run before any test module is imported. Keeping the test
 * database configuration here (instead of an ignored backend/.env) prevents
 * test values such as HOLD_SECONDS=2 from leaking into local development.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/pickup_test';
process.env.WEBHOOK_SECRET = 'pickup-test-secret-12345';
process.env.HOLD_SECONDS = '2';
process.env.DEMO_MODE = 'true';
