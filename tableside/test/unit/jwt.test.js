import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtVerify } from 'jose';
import { mintTenantAnonToken } from '../../lib/jwt.js';

test('anon tenant token carries role anon, tenant_id and a 5-minute expiry', async () => {
  const secret = 'x'.repeat(32);
  const tok = await mintTenantAnonToken({ tenantId: 't-1', secret, nowS: 1_000_000, ttlS: 300 });
  const { payload } = await jwtVerify(tok, new TextEncoder().encode(secret), { currentDate: new Date(1_000_100 * 1000) });
  assert.deepEqual(payload, { role: 'anon', tenant_id: 't-1', iat: 1_000_000, exp: 1_000_300 });
  await assert.rejects(jwtVerify(tok, new TextEncoder().encode(secret), { currentDate: new Date(1_000_301 * 1000) }), /exp/);
});

test('refuses to mint without a tenant or a secret', async () => {
  await assert.rejects(mintTenantAnonToken({ tenantId: '', secret: 's', nowS: 0, ttlS: 1 }), /tenantId/);
  await assert.rejects(mintTenantAnonToken({ tenantId: 't', secret: '', nowS: 0, ttlS: 1 }), /secret/);
});
