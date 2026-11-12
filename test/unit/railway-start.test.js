import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEnvironment, waitForDatabase } from '../../scripts/start-railway.js';

const valid = () => ({ DB_HOST: 'mysql.railway.internal', DB_PORT: '3306', DB_NAME: 'railway', DB_USER: 'test', DB_PASSWORD: 'test-only-password-1234', RAILWAY_PUBLIC_DOMAIN: 'nexcent-test.up.railway.app' });
test('Railway: missing variables fail before attempting localhost', () => {
  assert.throws(() => prepareEnvironment({}), /DB_HOST.*DB_PORT.*DB_NAME.*DB_USER.*DB_PASSWORD/);
});
test('Railway: defaults use the platform domain and production cookies', () => {
  const input = valid();
  const result = prepareEnvironment(input);
  assert.equal(result.APP_ORIGIN, 'https://nexcent-test.up.railway.app');
  assert.equal(result.NODE_ENV, 'production');
  assert.equal(result.TRUST_PROXY, '1');
  assert.equal(result.SEED_DEMO_REVIEWS, 'false');
  assert.equal(input.APP_ORIGIN, undefined);
});
test('Railway: explicit custom origin wins and trailing slash is removed', () => {
  assert.equal(prepareEnvironment({ ...valid(), APP_ORIGIN: 'https://restaurant.example/' }).APP_ORIGIN, 'https://restaurant.example');
});
test('Railway: missing domain and placeholders are rejected', () => {
  for (const origin of ['', 'http://localhost:3000', 'https://example.invalid', 'https://site.example/path', 'https://user:pass@site.example']) {
    assert.throws(() => prepareEnvironment({ ...valid(), RAILWAY_PUBLIC_DOMAIN: '', APP_ORIGIN: origin }), /APP_ORIGIN/);
  }
  assert.throws(() => prepareEnvironment({ ...valid(), DB_HOST: '${{MySQL.MYSQLHOST}}' }), /DB_HOST/);
});
test('Railway: invalid port and placeholder password fail without exposing values', () => {
  assert.throws(() => prepareEnvironment({ ...valid(), DB_PORT: '99999' }), /DB_PORT/);
  assert.throws(() => prepareEnvironment({ ...valid(), DB_PASSWORD: 'CHANGE_ME_RANDOM_PASSWORD' }), /DB_PASSWORD/);
});
test('Railway: temporary refusal retries and closes the successful probe', async () => {
  let calls = 0, closed = 0, delays = 0;
  await waitForDatabase(async () => {
    if (++calls < 3) throw Object.assign(new Error('private detail'), { code: 'ECONNREFUSED' });
    return { query: async sql => assert.equal(sql, 'SELECT 1'), destroy: () => closed++ };
  }, { delay: async () => delays++, log: () => {} });
  assert.equal(calls, 3); assert.equal(delays, 2); assert.equal(closed, 1);
});
test('Railway: bad credentials fail immediately and redact the driver message', async () => {
  let calls = 0;
  await assert.rejects(waitForDatabase(async () => {
    calls++;
    throw Object.assign(new Error('secret-password'), { code: 'ER_ACCESS_DENIED_ERROR' });
  }), error => error.message.includes('ER_ACCESS_DENIED_ERROR') && !error.message.includes('secret-password'));
  assert.equal(calls, 1);
});
test('Railway: retries are bounded', async () => {
  let calls = 0;
  await assert.rejects(waitForDatabase(async () => {
    calls++; throw Object.assign(new Error(), { code: 'ECONNREFUSED' });
  }, { attempts: 2, delay: async () => {}, log: () => {} }), /ECONNREFUSED/);
  assert.equal(calls, 2);
});
test('Railway: failed query also closes the probe connection', async () => {
  let closed = 0;
  await assert.rejects(waitForDatabase(async () => ({
    query: async () => { throw Object.assign(new Error(), { code: 'ER_BAD_DB_ERROR' }); },
    destroy: () => closed++
  })), /ER_BAD_DB_ERROR/);
  assert.equal(closed, 1);
});
