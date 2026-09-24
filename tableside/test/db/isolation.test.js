// Tenant isolation (spec §11.3), against real Postgres with the real migrations.
// Requests are emulated the way PostgREST runs them: set local role + JWT claims.
// Mutation-tested: each mutation below weakens one layer, and the same checker
// must report it. A checker that can't fail proves nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDevStackEnv } from '../helpers/stack.js';
import { ROOT } from '../helpers/paths.js';
import { seed, tenantTables } from './fixtures.js';
import { isolationViolations, platformViolations } from './isolation-check.js';

const env = loadDevStackEnv();
const { pgClientFor, ENV_KEYS } = await import('../../lib/db.js');
let c; let fx;

before(async () => {
  c = pgClientFor(env[ENV_KEYS.dbUrl]);
  await c.connect();
  await c.query('begin'); // everything below is rolled back in after()
  fx = await seed(c);
});
after(async () => { if (c) { await c.query('rollback'); await c.end(); } });

test('fixtures cover every tenant table in migrations/', () => {
  const tables = tenantTables();
  assert.ok(tables.length >= 17, `expected the 0002+0003 tables, found ${tables.length}`);
  for (const t of tables) assert.ok(fx.rows[t].A.all.length && fx.rows[t].B.all.length, `${t} not seeded`);
});

test('isolation holds on every tenant table (reads, inserts, updates, deletes)', async () => {
  assert.deepEqual(await isolationViolations(c, fx), []);
});

test('control plane and audit log are isolated', async () => {
  assert.deepEqual(await platformViolations(c, fx), []);
});

/** Apply a mutation inside a savepoint, run the checker, roll the mutation back. */
async function mutated(sql, check = isolationViolations) {
  await c.query('savepoint mutation');
  try {
    await c.query(sql);
    return await check(c, fx);
  } finally {
    await c.query('rollback to savepoint mutation');
  }
}

const MUTATIONS = [
  ['read policy opened to everyone', `drop policy menus_read on menus; create policy menus_read on menus for select using (true)`, /menus: anon\(A\) can read a row it must not \(tenant B\)/],
  ['read policy dropped (RLS denies all)', `drop policy menu_items_read on menu_items`, /menu_items: anon\(A\) sees 0 rows, expected 1/],
  ['published filter removed', `drop policy events_read on events; create policy events_read on events for select using (platform.can_read(tenant_id))`, /events: anon\(A\) can read a row it must not/],
  ['can_read ignores the tenant claim', `create or replace function platform.can_read(t uuid) returns boolean language sql stable as $$ select platform.jwt_tenant_id() is not null or platform.is_member(t) $$`, /anon\(A\) can read a row it must not \(tenant B\)/],
  // Opening only the insert policy: the guard trigger still refuses cross-tenant rows
  // (defense in depth), so what leaks is anon writing into its own tenant.
  ['insert policy opened', `drop policy media_insert on media; create policy media_insert on media for insert with check (true)`, /media: anon\(A\) into its own tenant insert succeeded/],
  ['insert policy opened and guard dropped', `drop policy media_insert on media; create policy media_insert on media for insert with check (true); drop trigger media_guard on media`, /media: anon\(A\) with tenant_id=B insert succeeded/],
  ['guard trigger dropped', `drop trigger locations_guard on locations`, /locations: a member of both tenants moved a row A→B/],
  ['delete policy allows staff', `drop policy specials_delete on specials; create policy specials_delete on specials for delete using (platform.is_member(tenant_id))`, /specials: role 'staff' deleted a row/],
  ['RLS disabled on a request table', `alter table orders disable row level security`, /orders: anon\(A\) can read a row it must not/],
  ['request table readable by anon token', `drop policy reservation_requests_read on reservation_requests; create policy reservation_requests_read on reservation_requests for select using (platform.can_read(tenant_id))`, /reservation_requests: anon\(A\) can read a row it must not/],
];

for (const [name, sql, expect] of MUTATIONS) {
  test(`mutation is caught: ${name}`, async () => {
    const v = (await mutated(sql)).join('\n');
    assert.match(v, expect, `checker did not report the mutation; it reported:\n${v || '(nothing)'}`);
  });
}

test('mutation is caught: audit trigger removed', async () => {
  const v = (await mutated('drop trigger menus_audit on menus', platformViolations)).join('\n');
  assert.match(v, /audit: expected one insert row by staff\(A\)/);
});

test('mutation is caught: memberships readable by anyone', async () => {
  const v = (await mutated(`drop policy staff_read_own on platform.staff_memberships; create policy staff_read_own on platform.staff_memberships for select using (true); grant select on platform.staff_memberships to anon`, platformViolations)).join('\n');
  assert.match(v, /staff_memberships/);
});

test('every migration re-applies cleanly (idempotent)', async () => {
  const files = readFileSync(join(ROOT, 'migrations', '.checksums'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[1]);
  for (const f of files) {
    await c.query('savepoint reapply');
    try { await c.query(readFileSync(join(ROOT, 'migrations', f), 'utf8')); }
    catch (e) { assert.fail(`${f} is not idempotent: ${e.message}`); }
    finally { await c.query('rollback to savepoint reapply'); }
  }
});
