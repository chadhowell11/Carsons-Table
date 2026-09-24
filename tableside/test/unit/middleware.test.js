// resolveTenant, attachUser, requireStaff, requireFeature with fake clients:
// every branch returns the status that names the right party.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachUser, requireStaff } from '../../middleware/auth.js';
import { requireFeature } from '../../middleware/features.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { __setRegistryForTests } from '../../lib/tenants.js';

const run = (mw, req) => new Promise((resolve) => { mw(req, { vary() {} }, (err) => resolve(err || null)); });

function fakeTenant({ user, userError, throwAuth, membership, membershipError } = {}) {
  return {
    id: 't1', features: { ordering: true, members: false },
    forToken: () => ({
      auth: { getUser: async () => { if (throwAuth) throw new Error('ECONNREFUSED'); return userError ? { data: {}, error: userError } : { data: { user }, error: null }; } },
      schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership || null, error: membershipError || null }) }) }) }) }) }),
    }),
  };
}

test('attachUser: no header is a no-op; valid token sets req.user', async () => {
  const req = { headers: {}, tenant: fakeTenant() };
  assert.equal(await run(attachUser, req), null); assert.equal(req.user, undefined);
  const req2 = { headers: { authorization: 'Bearer abc' }, tenant: fakeTenant({ user: { id: 'u1', email: 'a@b.c' } }) };
  assert.equal(await run(attachUser, req2), null);
  assert.deepEqual(req2.user, { id: 'u1', email: 'a@b.c' });
});

test('attachUser: a rejected token is INVALID_TOKEN (401 later); auth service down is 503', async () => {
  const req = { headers: { authorization: 'Bearer abc' }, tenant: fakeTenant({ userError: { status: 401, message: 'bad jwt' } }) };
  assert.equal(await run(attachUser, req), null); assert.equal(req.authError, 'INVALID_TOKEN');
  const down = await run(attachUser, { headers: { authorization: 'Bearer abc' }, tenant: fakeTenant({ throwAuth: true }) });
  assert.equal(down.status, 503); assert.equal(down.code, 'AUTH_UNAVAILABLE');
  const down2 = await run(attachUser, { headers: { authorization: 'Bearer abc' }, tenant: fakeTenant({ userError: { status: 500 } }) });
  assert.equal(down2.status, 503);
});

test('requireStaff: 401 not signed in, 403 not a member (never 401), 403 role too low, 503 store down', async () => {
  const mw = requireStaff('manager');
  assert.equal((await run(mw, { tenant: fakeTenant() })).status, 401);
  const nm = await run(mw, { tenant: fakeTenant(), user: { id: 'u' }, jwt: 'j' });
  assert.deepEqual([nm.status, nm.code], [403, 'NOT_A_MEMBER']);
  const low = await run(mw, { tenant: fakeTenant({ membership: { role: 'staff' } }), user: { id: 'u' }, jwt: 'j' });
  assert.deepEqual([low.status, low.code], [403, 'INSUFFICIENT_ROLE']);
  const down = await run(mw, { tenant: fakeTenant({ membershipError: { message: 'fetch failed' } }), user: { id: 'u' }, jwt: 'j' });
  assert.deepEqual([down.status, down.code], [503, 'STORE_READ_UNAVAILABLE']);
  const req = { tenant: fakeTenant({ membership: { role: 'owner' } }), user: { id: 'u' }, jwt: 'j' };
  assert.equal(await run(mw, req), null);
  assert.deepEqual(req.staff, { userId: 'u', role: 'owner' });
});

test('requireFeature: off feature is 404 (invisible), not 403; unknown feature names fail at boot', async () => {
  assert.equal(await run(requireFeature('ordering'), { tenant: fakeTenant() }), null);
  assert.equal((await run(requireFeature('members'), { tenant: fakeTenant() })).status, 404);
  assert.throws(() => requireFeature('ordring'), /unknown feature/);
  assert.throws(() => requireStaff('admin'), /unknown role/);
});

test('resolveTenant: unknown host -> null tenant; archived -> 404; known -> descriptor with factory', async () => {
  __setRegistryForTests([
    { id: 'a', slug: 'a', name: 'A', status: 'live', timezone: 'UTC', currency: 'USD', features: {}, brand: {}, tenant_domains: [{ host: 'a.localhost', is_primary: true, verified_at: 'x' }] },
    { id: 'z', slug: 'z', name: 'Z', status: 'archived', timezone: 'UTC', currency: 'USD', features: {}, brand: {}, tenant_domains: [{ host: 'z.localhost', is_primary: true, verified_at: 'x' }] },
  ]);
  const u = { headers: { host: 'nope.example' } }; assert.equal(await run(resolveTenant, u), null); assert.equal(u.tenant, null);
  assert.equal((await run(resolveTenant, { headers: { host: 'z.localhost' } })).status, 404);
  const k = { headers: { host: 'A.localhost:3000' } }; assert.equal(await run(resolveTenant, k), null);
  assert.equal(k.tenant.slug, 'a'); assert.equal(typeof k.tenant.forToken, 'function');
});
