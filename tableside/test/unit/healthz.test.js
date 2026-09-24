import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthz } from '../../routes/public.js';
import { __setRegistryForTests } from '../../lib/tenants.js';

function call(pool) {
  return new Promise((resolve) => {
    const res = { code: 0, set() { return this; }, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    healthz({ pool: () => pool })({}, res);
  });
}

test('healthy only when read AND write succeed', async () => {
  __setRegistryForTests([], new Date('2026-01-01'));
  const r = await call({ query: async () => ({ rows: [] }) });
  assert.equal(r.status, 200); assert.equal(r.body.write, 'ok');
});

test('a read-only database is unhealthy: 503 with write:error', async () => {
  __setRegistryForTests([], new Date('2026-01-01'));
  const pool = { query: async (sql) => { if (/insert/.test(sql)) throw new Error('cannot execute INSERT in a read-only transaction'); return { rows: [] }; } };
  const r = await call(pool);
  assert.deepEqual([r.status, r.body.db, r.body.write, r.body.ok], [503, 'ok', 'error', false]);
});
