import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHost, buildRegistry, load, getByHost, getBySlug, uniqueTenants, registryStatus, normalizeFeatures, __setRegistryForTests } from '../../lib/tenants.js';
import { FEATURES } from '../../lib/enums.js';

const row = (o = {}) => ({
  id: 'a', slug: 'carsons-table', name: "Carson's Table", status: 'draft', timezone: 'America/Chicago', currency: 'USD', features: { ordering: true }, brand: {}, env_prefix: null,
  tenant_domains: [
    { host: 'carsons-table.localhost', is_primary: true, verified_at: '2026-01-01' },
    { host: 'carsonstable.localhost', is_primary: false, verified_at: '2026-01-01' },
    { host: 'carsonstable.com', is_primary: false, verified_at: null },
  ], ...o,
});

test('normalizeHost lowercases and strips port and trailing dot', () => {
  assert.equal(normalizeHost('CarsonsTable.COM:443'), 'carsonstable.com');
  assert.equal(normalizeHost('carsonstable.com.'), 'carsonstable.com');
  assert.equal(normalizeHost('[::1]:3000'), '::1');
  assert.equal(normalizeHost(undefined), '');
});

test('aliases fold to one descriptor; unverified domains (awaiting DNS) do not resolve', () => {
  const { byHost } = buildRegistry([row()]);
  assert.equal(byHost.get('carsons-table.localhost'), byHost.get('carsonstable.localhost'));
  assert.equal(byHost.get('carsonstable.com'), undefined);
  assert.equal(byHost.get('carsons-table.localhost').primaryHost, 'carsons-table.localhost');
});

test('features are normalized to exactly the FEATURES keys, true only when literally true', () => {
  const f = normalizeFeatures({ ordering: true, reservations: 'yes', bogus: true });
  assert.deepEqual(Object.keys(f), [...FEATURES]);
  assert.equal(f.ordering, true); assert.equal(f.reservations, false); assert.equal(f.bogus, undefined);
});

test('a host claimed by two tenants is an error, not last-write-wins', () => {
  assert.throws(() => buildRegistry([row(), row({ id: 'b', slug: 'other' })]), /claimed by both/);
});

test('a failed refresh keeps the last good registry (failure is not absence)', async () => {
  __setRegistryForTests([row()]);
  const failing = { schema: () => ({ from: () => ({ select: async () => ({ data: null, error: { code: '503', message: 'down' } }) }) }) };
  await assert.rejects(load({ client: failing }), /registry load failed: 503 down/);
  assert.equal(getByHost('carsons-table.localhost').slug, 'carsons-table');
  assert.equal(registryStatus().last_error, '503 down');
});

test('a successful load swaps the registry; archived tenants are excluded from uniqueTenants but still resolvable', async () => {
  const ok = { schema: () => ({ from: () => ({ select: async () => ({ data: [row({ status: 'archived' })], error: null }) }) }) };
  await load({ client: ok, now: () => new Date('2026-09-24T00:00:00Z') });
  assert.equal(getBySlug('carsons-table').status, 'archived');
  assert.deepEqual(uniqueTenants(), []);
  assert.deepEqual(registryStatus(), { tenants: 0, loaded_at: '2026-09-24T00:00:00.000Z', last_error: null });
});
