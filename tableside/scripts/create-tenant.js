// @ts-check
// Stand-in for the Phase 3 platform admin: creates a tenant row, its domains and
// an owner membership (spec §13).
//
//   node scripts/create-tenant.js --slug carsons-table --name "Carson's Table" \
//     --tz America/Chicago --currency USD --host carsonstable.com --alias www.carsonstable.com \
//     --brand sites/carsons-table/brand.json --features ordering,reservations,specials,events,gallery \
//     --owner-email <owner email>
//
// Real domains are inserted unverified ("awaiting DNS") and do not resolve until
// verified; *.localhost domains are marked verified. The owner is invited by
// email (GoTrue sends the invite) unless --owner-password is given (dev only).
// New tenants start as status 'draft', which keeps the public site noindex.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { adminSystemClient } from '../lib/db.js';
import { FEATURES, ROLES, TENANT_STATUS } from '../lib/enums.js';
import { normalizeHost } from '../lib/tenants.js';
import { validateBrand } from '../renderer/tokens.js';
import { IS_PRODUCTION, PUBLIC_BASE_SCHEME } from '../lib/platform.js';

/** @param {string} h */
export const isLocalHost = (h) => h === 'localhost' || h.endsWith('.localhost');

/**
 * @param {{
 *   slug: string, name: string, timezone?: string, currency?: string, status?: string,
 *   hosts: string[], aliases?: string[], brand: any, features: string[],
 *   owners?: { email: string, password?: string, role?: string }[],
 *   upsert?: boolean, log?: (m: string) => void, client?: any
 * }} p
 */
export async function createTenant(p) {
  const log = p.log || console.log;
  const db = p.client || adminSystemClient();
  const timezone = p.timezone || 'America/Chicago';
  const currency = (p.currency || 'USD').toUpperCase();
  const status = p.status || 'draft';

  const problems = [];
  if (!/^[a-z0-9-]+$/.test(p.slug || '')) problems.push('--slug must match ^[a-z0-9-]+$');
  if (!p.name) problems.push('--name is required');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { problems.push(`--tz ${timezone} is not an IANA time zone`); }
  if (!/^[A-Z]{3}$/.test(currency)) problems.push('--currency must be a 3-letter code');
  if (!(/** @type {readonly string[]} */ (TENANT_STATUS)).includes(status)) problems.push(`status must be one of ${TENANT_STATUS.join(', ')}`);
  const unknown = p.features.filter((f) => !(/** @type {readonly string[]} */ (FEATURES)).includes(f));
  if (unknown.length) problems.push(`unknown features ${unknown.join(', ')}; allowed: ${FEATURES.join(', ')}`);
  const hosts = [...(p.hosts || []), ...(p.aliases || [])].map(normalizeHost);
  if (!hosts.length) problems.push('at least one --host is required');
  for (const o of p.owners || []) {
    if (o.role && !(/** @type {readonly string[]} */ (ROLES)).includes(o.role)) problems.push(`role must be one of ${ROLES.join(', ')}`);
    if (o.password && IS_PRODUCTION) problems.push('--owner-password is dev-only; invite by email in production');
  }
  try { validateBrand(p.brand); } catch (e) { problems.push(/** @type {Error} */ (e).message); }
  if (problems.length) throw new Error(problems.join('\n'));

  const features = Object.fromEntries(FEATURES.map((f) => [f, p.features.includes(f)]));
  const plat = db.schema('platform');

  const existing = await plat.from('tenants').select('id').eq('slug', p.slug).maybeSingle();
  if (existing.error) throw new Error(`reading tenants: ${existing.error.message}`);
  if (existing.data && !p.upsert) throw new Error(`tenant ${p.slug} already exists`);
  const row = { slug: p.slug, name: p.name, timezone, currency, status, features, brand: p.brand };
  const t = existing.data
    ? await plat.from('tenants').update(row).eq('id', existing.data.id).select('id').single()
    : await plat.from('tenants').insert(row).select('id').single();
  if (t.error) throw new Error(`writing tenant: ${t.error.message}`);
  const tenantId = t.data.id;
  log(`${existing.data ? 'updated' : 'created'} tenant ${p.slug} (${tenantId}) status=${status}`);

  for (const [i, host] of hosts.entries()) {
    const claimed = await plat.from('tenant_domains').select('tenant_id').eq('host', host).maybeSingle();
    if (claimed.error) throw new Error(`reading domains: ${claimed.error.message}`);
    if (claimed.data && claimed.data.tenant_id !== tenantId) throw new Error(`host ${host} belongs to another tenant`);
    const local = isLocalHost(host);
    const d = await plat.from('tenant_domains').upsert({
      host, tenant_id: tenantId, is_primary: i === 0, verified_at: local ? new Date().toISOString() : null,
    }, { onConflict: 'host' });
    if (d.error) throw new Error(`writing domain ${host}: ${d.error.message}`);
    log(`  domain ${host}${i === 0 ? ' (primary)' : ''} — ${local ? 'verified (localhost)' : 'awaiting DNS'}`);
  }

  for (const o of p.owners || []) {
    const userId = await ensureUser(db, o, hosts[0], log);
    const m = await plat.from('staff_memberships').upsert({ user_id: userId, tenant_id: tenantId, role: o.role || 'owner' }, { onConflict: 'user_id,tenant_id' });
    if (m.error) throw new Error(`writing membership: ${m.error.message}`);
    log(`  ${o.role || 'owner'} ${o.email}`);
  }
  return { tenantId };
}

/** @param {any} db @param {{email:string,password?:string}} o @param {string} host @param {(m:string)=>void} log */
async function ensureUser(db, o, host, log) {
  const email = o.email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listing users: ${error.message}`);
    const hit = data.users.find((/** @type {any} */ u) => (u.email || '').toLowerCase() === email);
    if (hit) {
      if (o.password) {
        const up = await db.auth.admin.updateUserById(hit.id, { password: o.password });
        if (up.error) throw new Error(`setting password: ${up.error.message}`);
      }
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  if (o.password) {
    const { data, error } = await db.auth.admin.createUser({ email, password: o.password, email_confirm: true });
    if (error) throw new Error(`creating user ${email}: ${error.message}`);
    return data.user.id;
  }
  const scheme = isLocalHost(host) ? 'http' : PUBLIC_BASE_SCHEME;
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${scheme}://${host}/admin/login` });
  if (error) throw new Error(`inviting ${email}: ${error.message}`);
  log(`  invite sent to ${email}`);
  return data.user.id;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { values: v } = parseArgs({
    options: {
      slug: { type: 'string' }, name: { type: 'string' }, tz: { type: 'string' }, currency: { type: 'string' },
      host: { type: 'string', multiple: true }, alias: { type: 'string', multiple: true },
      brand: { type: 'string' }, features: { type: 'string' }, status: { type: 'string' },
      'owner-email': { type: 'string' }, 'owner-password': { type: 'string' },
    },
  });
  try {
    if (!v.brand) throw new Error('--brand <path to brand.json> is required');
    await createTenant({
      slug: String(v.slug || ''), name: String(v.name || ''), timezone: v.tz, currency: v.currency, status: v.status,
      hosts: v.host || [], aliases: v.alias || [],
      brand: JSON.parse(readFileSync(v.brand, 'utf8')),
      features: (v.features || '').split(',').map((s) => s.trim()).filter(Boolean),
      owners: v['owner-email'] ? [{ email: v['owner-email'], password: v['owner-password'] }] : [],
    });
    console.log('done. Running servers pick this up within 60s, or send them SIGHUP.');
  } catch (e) {
    console.error(/** @type {Error} */ (e).message);
    process.exitCode = 1;
  }
}
