'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseValue } = require('../src/validate');
const { requireAuth } = require('../src/auth');

test('accepts numbers and numeric strings', () => {
  assert.deepEqual(parseValue(21.5), { ok: true, value: 21.5 });
  assert.deepEqual(parseValue('21.5'), { ok: true, value: 21.5 });
  assert.deepEqual(parseValue(' -3 '), { ok: true, value: -3 });
  assert.deepEqual(parseValue('0'), { ok: true, value: 0 });
});

test('rounds to four decimal places', () => {
  assert.deepEqual(parseValue(1.23456789), { ok: true, value: 1.2346 });
});

test('rejects non-numeric input', () => {
  for (const bad of ['abc', '', '1e5', '1,5', '12abc', null, undefined, {}, [], true, NaN, Infinity]) {
    assert.equal(parseValue(bad).ok, false, `should reject ${String(bad)}`);
  }
});

test('rejects values that do not fit DECIMAL(12,4)', () => {
  assert.equal(parseValue(1e8).ok, false);
  assert.equal(parseValue('-100000000').ok, false);
  assert.equal(parseValue(99999999.9999).ok, true);
});

test('requireAuth rejects requests without a cookie', async () => {
  const middleware = requireAuth({ verify: async () => ({ status: 200, username: 'x' }) });
  let statusCode = null;
  const res = { status(c) { statusCode = c; return this; }, json() { return this; } };
  await middleware({ cookies: {} }, res, () => assert.fail('next must not be called'));
  assert.equal(statusCode, 401);
});

test('requireAuth returns 503 when the auth service is unreachable', async () => {
  const middleware = requireAuth({ verify: async () => ({ status: 0 }) });
  let statusCode = null;
  const res = { status(c) { statusCode = c; return this; }, json() { return this; } };
  await middleware({ cookies: { token: 't' } }, res, () => assert.fail('next must not be called'));
  assert.equal(statusCode, 503);
});

test('requireAuth sets req.user and continues for a valid token', async () => {
  const middleware = requireAuth({ verify: async () => ({ status: 200, username: 'alice' }) });
  const req = { cookies: { token: 't' } };
  let called = false;
  await middleware(req, {}, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, 'alice');
});
