// lib/db.js env resolution, including the silo swap-point (spec §2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, envKeysFor, ENV_KEYS, attachClients } from '../../lib/db.js';

const pooled = { [ENV_KEYS.url]: 'http://pooled', [ENV_KEYS.anonKey]: 'anon-p', [ENV_KEYS.serviceKey]: 'svc-p', [ENV_KEYS.jwtSecret]: 'sec-p' };

test('pooled descriptor reads the TS_ keys', () => {
  assert.deepEqual(resolveConfig({ envPrefix: null }, pooled), { url: 'http://pooled', anonKey: 'anon-p', serviceKey: 'svc-p', jwtSecret: 'sec-p' });
});

test('envPrefix descriptor reads ${prefix}_SUPABASE_URL etc. — the silo swap-point', () => {
  const env = { ...pooled, CT_SUPABASE_URL: 'http://silo', CT_SUPABASE_ANON_KEY: 'anon-s', CT_SUPABASE_SERVICE_KEY: 'svc-s', CT_JWT_SECRET: 'sec-s' };
  assert.deepEqual(resolveConfig({ envPrefix: 'CT' }, env), { url: 'http://silo', anonKey: 'anon-s', serviceKey: 'svc-s', jwtSecret: 'sec-s' });
  assert.deepEqual(Object.values(envKeysFor({ envPrefix: 'CT' })), ['CT_SUPABASE_URL', 'CT_SUPABASE_ANON_KEY', 'CT_SUPABASE_SERVICE_KEY', 'CT_JWT_SECRET']);
});

test('a silo tenant with missing keys is an error, never a silent fallback to the pooled project', () => {
  assert.throws(() => resolveConfig({ envPrefix: 'CT' }, { ...pooled, CT_SUPABASE_URL: 'http://silo' }), /Missing environment: CT_SUPABASE_ANON_KEY, CT_SUPABASE_SERVICE_KEY, CT_JWT_SECRET/);
});

test('missing pooled keys name every missing key', () => {
  const { dbUrl, ...pooledKeys } = ENV_KEYS;
  assert.throws(() => resolveConfig(undefined, {}), new RegExp(`Missing environment: ${Object.values(pooledKeys).join(', ')}$`));
});

test('malformed envPrefix is refused', () => {
  assert.throws(() => envKeysFor({ envPrefix: 'ct;rm' }), /UPPER_SNAKE/);
});

test('the harness cleared TS_* (tests never inherit credentials)', () => {
  assert.deepEqual(Object.keys(process.env).filter((k) => k.startsWith('TS_')), []);
  const t = attachClients({ id: 'x' });
  assert.throws(() => t.publicConfig(), /Missing environment/);
});
