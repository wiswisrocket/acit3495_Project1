'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { signToken, verifyToken } = require('../src/tokens');
const { parseCredentials, createLoginGuard } = require('../src/validate');

const SECRET = 'test-secret-value';

test('a signed token verifies and returns the username', () => {
  const token = signToken('alice', SECRET);
  assert.deepEqual(verifyToken(token, SECRET), { ok: true, username: 'alice' });
});

test('a token signed with a different secret is rejected', () => {
  const token = signToken('alice', 'other-secret');
  assert.equal(verifyToken(token, SECRET).ok, false);
});

test('an expired token is rejected', () => {
  const token = signToken('alice', SECRET, '-10s');
  assert.equal(verifyToken(token, SECRET).ok, false);
});

test('garbage tokens are rejected without throwing', () => {
  assert.equal(verifyToken('not.a.jwt', SECRET).ok, false);
  assert.equal(verifyToken('', SECRET).ok, false);
});

test('parseCredentials accepts a normal login', () => {
  assert.deepEqual(parseCredentials({ username: 'alice_1', password: 'secret' }), {
    ok: true,
    username: 'alice_1',
    password: 'secret',
  });
});

test('parseCredentials rejects bad usernames and passwords', () => {
  assert.equal(parseCredentials({ username: "a'; DROP TABLE users;--", password: 'x' }).ok, false);
  assert.equal(parseCredentials({ username: '', password: 'x' }).ok, false);
  assert.equal(parseCredentials({ username: 'alice', password: '' }).ok, false);
  assert.equal(parseCredentials({ username: 'alice', password: 'x'.repeat(129) }).ok, false);
  assert.equal(parseCredentials({ username: { $ne: null }, password: 'x' }).ok, false);
  assert.equal(parseCredentials(null).ok, false);
});

test('login guard locks after repeated failures and unlocks after the window', () => {
  let t = 0;
  const guard = createLoginGuard({ maxFailures: 3, windowMs: 1000, now: () => t });
  assert.equal(guard.isLocked('alice'), false);
  guard.recordFailure('alice');
  guard.recordFailure('alice');
  assert.equal(guard.isLocked('alice'), false);
  guard.recordFailure('alice');
  assert.equal(guard.isLocked('alice'), true);
  assert.equal(guard.isLocked('bob'), false);
  t = 1001;
  assert.equal(guard.isLocked('alice'), false);
});

test('a successful login clears the failure count', () => {
  const guard = createLoginGuard({ maxFailures: 2 });
  guard.recordFailure('alice');
  guard.recordSuccess('alice');
  guard.recordFailure('alice');
  assert.equal(guard.isLocked('alice'), false);
});
