import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, toResponse, fromStoreError } from '../../lib/errors.js';

test('HttpError carries a code and the default message for it', () => {
  const r = toResponse(new HttpError(403, 'NOT_A_MEMBER'));
  assert.deepEqual(r, { status: 403, body: { code: 'NOT_A_MEMBER', message: "You don't have access to this restaurant's admin." } });
});

test('datastore failures on writes are 503 "nothing was saved", never 400', () => {
  for (const err of [{ message: 'TypeError: fetch failed', code: '' }, { code: '08006' }, { code: 'PGRST000' }, {}]) {
    const e = fromStoreError(err, 'write');
    assert.equal(e.status, 503); assert.equal(e.code, 'STORE_UNAVAILABLE'); assert.equal(e.body.message, 'Nothing was saved. Try again in a moment.');
  }
});

test('the caller\'s fault maps to 4xx; RLS refusal is 403', () => {
  assert.equal(fromStoreError({ code: '23514', message: 'x' }, 'write').status, 400);
  assert.equal(fromStoreError({ code: '23505' }, 'write').status, 409);
  assert.equal(fromStoreError({ code: '42501' }, 'write').status, 403);
  assert.equal(fromStoreError({ code: 'PGRST116' }, 'read').status, 404);
});

test('unknown errors are 500 with a generic body (details go to the log)', () => {
  const r = toResponse(new Error('secret connection string in here'));
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /secret/);
});
