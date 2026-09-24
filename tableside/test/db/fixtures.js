// Seeds two tenants' worth of rows into every tenant table, inside the caller's
// transaction, as the superuser (RLS bypassed for setup only).
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parseMigrations } from '../static/guards.js';
import { ROOT } from '../helpers/paths.js';

/** Tenant tables in the migrations, in file order (parents before children). */
export function tenantTables() {
  return [...parseMigrations(join(ROOT, 'migrations')).tables.keys()].filter((t) => !t.startsWith('platform.'));
}

/** Tables whose anon visibility is `status = 'published'`; the rest are staff-only. */
export const PUBLIC_CONTENT = new Set(['locations', 'hours', 'hours_exceptions', 'media', 'menus', 'menu_sections', 'menu_items',
  'item_servings', 'modifier_groups', 'modifiers', 'specials', 'events', 'site_content']);

/**
 * One builder per tenant table. Each returns rows to insert given the tenant and
 * the ids created so far. A table with no builder fails the test (so a new
 * table can't silently escape the isolation suite).
 */
export const BUILDERS = {
  locations: (t) => both((st) => ({ name: `${t.slug} ${st}`, status: st })),
  hours: (t, ids) => both((st) => ({ location_id: ids.locations, dow: 2, service: 'dinner', opens: '16:00', closes: '21:00', status: st })),
  hours_exceptions: (t, ids) => both((st) => ({ location_id: ids.locations, on_date: '2026-12-25', closed: true, status: st })),
  media: (t) => both((st) => ({ storage_path: `${t.id}/${randomUUID()}.webp`, alt: `${t.slug} photo`, status: st })),
  menus: (t, ids, x = '') => both((st) => ({ slug: `dinner-${st}${x}`, name: 'Dinner', kind: 'food', status: st })),
  menu_sections: (t, ids) => both((st) => ({ menu_id: ids.menus, name: 'Starters', status: st })),
  menu_items: (t, ids, x = '') => both((st) => ({ section_id: ids.menu_sections, name: `Crab cakes ${st}`, price_cents: 2400, dietary_tags: ['shellfish'], import_key: `k-${st}${x}`, status: st })),
  item_servings: (t, ids) => both((st) => ({ item_id: ids.menu_items, label: 'Glass', price_cents: 1200, status: st })),
  modifier_groups: (t, ids) => both((st) => ({ item_id: ids.menu_items, name: 'Sauce', selection: 'one', required: true, min_select: 1, max_select: 1, status: st })),
  modifiers: (t, ids) => both((st) => ({ group_id: ids.modifier_groups, label: 'Remoulade', status: st })),
  specials: (t) => both((st) => ({ title: 'Oyster hour', kind: 'happy_hour', schedule: { type: 'weekly', days: [4], from: '16:00', to: '19:00' }, status: st })),
  events: (t) => both((st) => ({ title: 'Trivia', kind: 'trivia', starts_at: '2026-10-02T01:00:00Z', status: st })),
  site_content: () => [{ hero_headline: 'Hello', status: 'published' }],
  reservation_requests: (t, ids) => [{ location_id: ids.locations, party_size: 4, requested_at: '2026-09-27T00:00:00Z', name: 'Dana', phone: '555' }],
  orders: (t, ids) => [{ location_id: ids.locations, mode: 'pickup', customer_name: 'Jordan', subtotal_cents: 3600, total_cents: 3600 }],
  order_items: (t, ids) => [{ order_id: ids.orders, name: 'Chargrilled oysters', unit_price_cents: 1800, qty: 2, line_total_cents: 3600 }],
  notifications_outbox: () => [{ channel: 'email', to_address: 'x@example.com', template: 'staff-invite' }],
};
/** The published row id of each already-seeded table for tenant t. */
export function parentIds(rows, t) {
  return Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v[t.key] && v[t.key].published[0]]));
}
function both(f) { return [f('published'), f('draft')]; }

/**
 * @param {{ returning?: boolean }} [o] returning:false models PostgREST's
 *   Prefer: return=minimal — no RETURNING, so the SELECT policy is not consulted
 *   and only the write policies and triggers decide.
 */
export async function insert(c, table, row, { returning = true } = {}) {
  const keys = Object.keys(row);
  const vals = keys.map((k) => (row[k] !== null && typeof row[k] === 'object' && !Array.isArray(row[k]) ? JSON.stringify(row[k]) : row[k]));
  const r = await c.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})${returning ? ' returning id' : ''}`, vals);
  return returning ? r.rows[0].id : r.rowCount;
}

/**
 * Seed tenants A and B, staff users, and one or two rows per table per tenant.
 * @returns fixture: { A, B, users, rows: { [table]: { [tenantKey]: { published: id[], draft: id[], all: id[] } } } }
 */
export async function seed(c) {
  const tag = randomUUID().slice(0, 8);
  const mk = async (key) => {
    const r = await c.query(`insert into platform.tenants (slug, name) values ($1, $2) returning id, slug`, [`iso-${key.toLowerCase()}-${tag}`, `Isolation ${key}`]);
    return { key, ...r.rows[0] };
  };
  const A = await mk('A'); const B = await mk('B');
  const user = async (name) => {
    const id = randomUUID();
    await c.query('insert into auth.users (id, email, aud, role) values ($1, $2, $3, $4)', [id, `${name}-${tag}@iso.test`, 'authenticated', 'authenticated']);
    return id;
  };
  const users = { staffA: await user('staff-a'), managerA: await user('manager-a'), staffB: await user('staff-b'), dual: await user('dual'), nobody: await user('nobody') };
  const member = (u, t, role) => c.query('insert into platform.staff_memberships (user_id, tenant_id, role) values ($1,$2,$3)', [u, t.id, role]);
  await member(users.staffA, A, 'staff'); await member(users.managerA, A, 'manager'); await member(users.staffB, B, 'staff');
  await member(users.dual, A, 'manager'); await member(users.dual, B, 'manager');

  const rows = {};
  for (const table of tenantTables()) {
    const b = BUILDERS[table];
    if (!b) throw new Error(`no isolation fixture builder for tenant table "${table}" — add one to test/db/fixtures.js`);
    rows[table] = {};
    for (const t of [A, B]) {
      const ids = parentIds(rows, t);
      const got = { published: [], draft: [], all: [] };
      for (const row of b(t, ids)) {
        const id = await insert(c, table, { tenant_id: t.id, ...row });
        got.all.push(id);
        (row.status === 'draft' ? got.draft : got.published).push(id);
      }
      rows[table][t.key] = got;
    }
  }
  return { A, B, users, rows, tag };
}

export const anon = (t) => ({ role: 'anon', claims: { role: 'anon', tenant_id: t.id } });
export const staff = (userId) => ({ role: 'authenticated', claims: { role: 'authenticated', sub: userId, aud: 'authenticated' } });
export const service = () => ({ role: 'service_role', claims: { role: 'service_role' } });

/**
 * Run fn as a JWT role inside a savepoint, the way PostgREST sets up a request.
 * Everything fn did (including a failed statement) is rolled back afterwards.
 * @returns {Promise<{ ok: true, value: any } | { ok: false, error: any }>}
 */
export async function as(c, who, fn) {
  await c.query('savepoint as_role');
  try {
    await c.query(`set local role ${who.role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who.claims)]);
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  } finally {
    await c.query('rollback to savepoint as_role');
    await c.query('release savepoint as_role');
  }
}
