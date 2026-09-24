// Phase 0 exit criteria, end to end against the dev stack, in one process:
//   two fixture hosts resolve to two tenants; the factory's clients are bound by
//   RLS through PostgREST; owners can log in; status codes name the right party.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDevStackEnv } from '../helpers/stack.js';
import { hostRequest } from '../helpers/http.js';
import { signIn } from '../helpers/auth.js';

const env = loadDevStackEnv();
const { createApp } = await import('../../app.js');
const tenants = await import('../../lib/tenants.js');
const db = await import('../../lib/db.js');
const { seedDev, DEV_USERS, DEV_PASSWORD, DEV_HOSTS } = await import('../../scripts/dev-fixtures.js');

let server; let base;
const K = db.ENV_KEYS;
const get = (host, path, headers) => hostRequest(base, host, path, { headers });

before(async () => {
  await seedDev({ log: () => {} });
  await tenants.load();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await db.closePool(); });

test('two hosts (plus an alias) resolve to two tenants from one process', async () => {
  const a = await get(DEV_HOSTS.carsons, '/');
  const alias = await get(`${DEV_HOSTS.carsonsAlias}:3000`, '/');
  const b = await get(DEV_HOSTS.demo, '/');
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(alias.status, 200);
  assert.match(a.text, /data-tenant="carsons-table"/);
  assert.match(alias.text, /data-tenant="carsons-table"/);
  assert.match(b.text, /data-tenant="demo-bistro"/);
  assert.match(a.text, /<title>Carson&#39;s Table<\/title>/);
  assert.equal(a.headers.vary, 'Host');
});

test('noindex until live: draft tenant carries it, live tenant does not', async () => {
  assert.match((await get(DEV_HOSTS.carsons, '/')).text, /<meta name="robots" content="noindex,nofollow">/);
  assert.doesNotMatch((await get(DEV_HOSTS.demo, '/')).text, /name="robots"/);
});

test('each tenant gets its own tokens; a tenant cannot fetch another tenant\'s tokens', async () => {
  const a = await get(DEV_HOSTS.carsons, '/t/carsons-table/tokens.css');
  const b = await get(DEV_HOSTS.demo, '/t/demo-bistro/tokens.css');
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.match(a.text, /--t-accent:#78905f;/); assert.match(a.text, /--t-dark:#234719;/);
  assert.match(b.text, /--t-accent:#0f766e;/);
  assert.equal((await get(DEV_HOSTS.demo, '/t/carsons-table/tokens.css')).status, 404);
});

test('unknown host gets the platform landing page, not a 404 and not a tenant', async () => {
  const r = await get('nobody.example.com', '/');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /data-tenant=/);
  assert.match(r.text, /domain isn.t connected yet/);
});

test('/healthz performs a real write', async () => {
  const pool = db.pgPool();
  const before = (await pool.query('select at from platform.heartbeat where id = 1')).rows[0]?.at;
  const r = await get('nobody.example.com', '/healthz');
  assert.equal(r.status, 200);
  const body = r.json();
  assert.deepEqual({ ok: body.ok, db: body.db, write: body.write }, { ok: true, db: 'ok', write: 'ok' });
  assert.ok(body.registry.tenants >= 2);
  const afterAt = (await pool.query('select at from platform.heartbeat where id = 1')).rows[0].at;
  assert.ok(!before || afterAt > before, 'heartbeat.at did not advance');
});

test('owner logs in; membership decides access; status codes name the right party', async () => {
  const owner = await signIn(env[K.url], env[K.anonKey], DEV_USERS.carsonsOwner, DEV_PASSWORD);
  const staff = await signIn(env[K.url], env[K.anonKey], DEV_USERS.carsonsStaff, DEV_PASSWORD);
  const demo = await signIn(env[K.url], env[K.anonKey], DEV_USERS.demoOwner, DEV_PASSWORD);
  const me = (host, tok) => get(host, '/api/admin/me', tok ? { authorization: `Bearer ${tok}` } : {});

  const ok = await me(DEV_HOSTS.carsons, owner);
  assert.equal(ok.status, 200);
  assert.equal(ok.json().role, 'owner');
  assert.equal(ok.json().tenant.slug, 'carsons-table');
  assert.equal(ok.json().features.ordering, true);
  assert.equal((await me(DEV_HOSTS.carsons, staff)).json().role, 'staff');
  assert.equal((await me(DEV_HOSTS.demo, demo)).json().tenant.slug, 'demo-bistro');

  const foreign = await me(DEV_HOSTS.demo, owner);
  assert.equal(foreign.status, 403, 'a real user without membership is 403, never 401');
  assert.equal(foreign.json().code, 'NOT_A_MEMBER');
  assert.equal(foreign.json().message, "You don't have access to this restaurant's admin.");

  assert.equal((await me(DEV_HOSTS.carsons)).json().code, 'NOT_SIGNED_IN');
  assert.equal((await me(DEV_HOSTS.carsons)).status, 401);
  const bad = await me(DEV_HOSTS.carsons, 'not-a-jwt');
  assert.equal(bad.status, 401); assert.equal(bad.json().code, 'INVALID_TOKEN');
  assert.equal((await me('nobody.example.com', owner)).status, 404, 'no tenant, no admin');
});

test('admin pages are shared and brand-injected per tenant', async () => {
  const a = await get(DEV_HOSTS.carsons, '/admin/login');
  const b = await get(DEV_HOSTS.demo, '/admin/login');
  assert.equal(a.status, 200);
  assert.doesNotMatch(a.text, /<!--BRAND-HEAD-->/);
  assert.match(a.text, /window.__BRAND__=\{"name":"Carson's Table"/);
  assert.match(b.text, /window.__BRAND__=\{"name":"Demo Bistro"/);
  assert.match(a.text, /noindex/);
  assert.doesNotMatch(a.text, new RegExp(env[K.serviceKey]), 'service key must never reach a browser');
  assert.equal((await get(DEV_HOSTS.carsons, '/admin/vendor/supabase.js')).status, 200);
  assert.equal((await get(DEV_HOSTS.carsons, '/admin/nope')).status, 404);
});

test('factory clients through PostgREST: anon sees only its tenant\'s published rows, staff only their own tenant', async () => {
  const A = db.attachClients(tenants.getBySlug('carsons-table'));
  const B = db.attachClients(tenants.getBySlug('demo-bistro'));
  const svc = A.adminClient;
  const rows = [
    { tenant_id: A.id, slug: 'e2e-pub', name: 'E2E', kind: 'food', status: 'published' },
    { tenant_id: A.id, slug: 'e2e-draft', name: 'E2E', kind: 'food', status: 'draft' },
    { tenant_id: B.id, slug: 'e2e-pub', name: 'E2E', kind: 'food', status: 'published' },
  ];
  const ins = await svc.from('menus').insert(rows).select('id');
  assert.equal(ins.error, null);
  try {
    const anonA = await (await A.publicClient()).from('menus').select('slug, tenant_id').like('slug', 'e2e-%');
    assert.equal(anonA.error, null);
    assert.deepEqual(anonA.data.map((r) => [r.tenant_id, r.slug]), [[A.id, 'e2e-pub']]);

    const owner = await signIn(env[K.url], env[K.anonKey], DEV_USERS.carsonsOwner, DEV_PASSWORD);
    const staffA = await A.forToken(owner).from('menus').select('slug, tenant_id').like('slug', 'e2e-%').order('slug');
    assert.deepEqual(staffA.data.map((r) => [r.tenant_id, r.slug]), [[A.id, 'e2e-draft'], [A.id, 'e2e-pub']]);

    const write = await (await A.publicClient()).from('menus').insert({ tenant_id: B.id, slug: 'e2e-evil', name: 'x', kind: 'food' });
    assert.ok(write.error, 'anon write across tenants must fail');

    const reg = await (await A.publicClient()).schema('platform').from('tenants').select('id');
    assert.ok(reg.error, 'anon must not read the registry');
  } finally {
    await svc.from('menus').delete().in('id', ins.data.map((r) => r.id));
  }
});
