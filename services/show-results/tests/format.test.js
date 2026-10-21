'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shapeStats } = require('../src/format');

test('shapes overall and per-user documents', () => {
  const when = new Date('2026-10-20T12:00:00Z');
  const result = shapeStats([
    { _id: 'user:bob', scope: 'user', username: 'bob', count: 2, min: 1, max: 3, avg: 2, updated_at: when },
    { _id: 'overall', scope: 'overall', count: 5, min: 1, max: 9, avg: 4.2, updated_at: when },
    { _id: 'user:alice', scope: 'user', username: 'alice', count: 3, min: 2, max: 9, avg: 5, updated_at: when },
  ]);
  assert.equal(result.overall.count, 5);
  assert.equal(result.overall.updated_at, '2026-10-20T12:00:00.000Z');
  assert.deepEqual(result.users.map((u) => u.username), ['alice', 'bob']);
});

test('returns an empty result when nothing has been computed yet', () => {
  assert.deepEqual(shapeStats([]), { overall: null, users: [] });
});

test('ignores documents that are not valid user stats', () => {
  const result = shapeStats([{ _id: 'junk', scope: 'user', count: 1 }]);
  assert.deepEqual(result.users, []);
});

test('does not leak unexpected fields from the database', () => {
  const result = shapeStats([{ _id: 'overall', scope: 'overall', count: 1, min: 1, max: 1, avg: 1, secret: 'x' }]);
  assert.equal('secret' in result.overall, false);
});
